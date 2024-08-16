import Content from './content'
import Graphics from "./graphics"
import Play, { Anim } from "./play"
import i from "./input"
import a from './sound'
import Time, { my_loop } from "./time"
import { RigidOptions, SteerBehaviors, WeightedBehavior } from './rigid'
import { Circle, Vec2 } from './math'

const v_accel = 20
const h_accel = 10
const max_dx = 10
const max_jump_dy = 2000
const fall_max_accel_y = 2000
const _G = 9

function lerp(a: number, b: number, t = 0.1) {
    return (1 - t) * a + t * b
}

function appr(v: number, t: number, by: number) {
    if (v < t) {
        return Math.min(v + by, t)
    } else if (v > t) {
        return Math.max(v - by, t)
    } else {
        return v
    }
}

type XYWH = { x: number, y: number, w: number, h: number }
// @ts-ignore
function collide_rect(a: XYWH, b: XYWH) {
    return a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
}


export function SceneManager(g: Graphics) {

    let scene: Scene

    const go = (scene_ctor: { new(x: number, y: number): Scene }) => {
        scene = new scene_ctor(0, 0)
        scene._set_data({ g, go })
        scene.init()
    }

    go(MyScene)

    my_loop(() => {
        scene.update()

        g.clear()
        g.fr(0, 0, 320, 180, '#fafafa')
        g.fr(1, 1, 318, 178, '#1f1f1f')
        scene.draw(g)
    })
}

class Scene extends Play {
    up_p = false
    song?: () => void



    get data() {
        return this._data as { g: Graphics, go: (_: { new(x: number, y: number): Scene }) => void}
    }

    get g() {
        return this.data.g
    }

    go(_: { new(x: number, y: number): Scene }) {
        this.data.go(_)
    }

    update() {

        if (i('m')) {
            if (!this.up_p) {
                this.up_p = true
                if (this.song) {
                    this.song()
                    this.song = undefined
                } else {
                    this.song = a.play('song', true)
                }
            }
        } else {
            this.up_p = false
        }
        super.update()
    }

}

class MyScene extends Scene {

  _init() {

    Content.load().then(() => {
        this.make(Anim, { name: 'loading', tag: 'audio', duration: 1000 }, 
            320 / 2, 
            180 / 2)

        a.generate().then(() => {
            //this.go(AudioLoaded)
            this.go(Intro)
        })
    })
  }

}

//@ts-ignore
class AudioLoaded extends Scene {

    _init() {

        const init = (e: KeyboardEvent) => {
            e.preventDefault()
            document.removeEventListener('keydown', init)
            this.go(Intro)
        }

        document.addEventListener('keydown', init)

        this.make(Anim, { name: 'loading', tag: 'input', duration: 1000 }, 260, 160)
    }
}


class Intro extends Scene {

    map!: MapLoader
    bar!: Bar

    _init() {
        this.song = a.play('song', true)

        this.map = this.make(MapLoader)
        this.bar = this.make(Bar)
    }
}

class Bar extends Play {
    _init() {
        for (let i = 0; i < 3; i++) {
            let _ = this.make(Anim, { name: 'bar' })
            _.x = 320 / 2 - 80 + (i * 80)
            _.y = 15
        }
        let e1 = this.make(Anim, { name: 'bar', tag: 'end' })
        e1.x = 320 / 2 - 80 - 20
        e1.y = 15
        let e2 = this.make(Anim, { name: 'bar', tag: 'end' })
        e2.x = 320 / 2 - 80 + 80 * 2 + 20
        e2.y = 15
        e2.scale_x = -1

        let m = this.make(Anim, { name: 'bar', tag: 'middle' })
        m.x = 320 / 2
        m.y = 15

        this.thumb = this.make(Anim, { name: 'bar', tag: 'thumb' })
        this.thumb.y = 25
    }

    thumb!: Anim

    width = 0

    _update() {
        //this.width = Math.floor(Math.abs(Math.sin(this.life * 2 * Math.PI * .2)) * 27)
        this.thumb.x = 320 / 2 - 80 - 40 + (this.width / 26) * 240
    }

    _pre_draw(g: Graphics) {
        g.fr(35, 12, 260, 8, 'red')
    }
}


class MapLoader extends Play {

    get bar() {
        return (this.parent as Intro).bar
    }

    w!: number
    h!: number
    tiles!: number[][]

    cam_x = 0
    cam_y = 0
    cam_zone_x = 0
    cam_zone_y = 0 
    cam_shake_x = 0
    cam_shake_y = 0

    shake_dx = 0
    shake_dy = 0

    _init() {

        const l = Content.levels[0]

        this.w = l.w
        this.h = l.h

        this.tiles = Array(l.h)

        for (let i = 0; i < l.h; i++) {
            this.tiles[i] = Array(l.w)
        }

        for (let i = 0; i < l.te.length; i++) {
            let { px, src } = l.te[i]

            let x = px[0] / 8
            let y = px[1] / 8

            let i_src = (src[1] / 8) * 20 + (src[0] / 8)

            if (i_src === 399) {
                this.make(Player, {}, px[0], px[1])
            } else if (i_src === 398) {
                this.make(TwoSpawn, {}, px[0], px[1])
            } else if (i_src === 397) {
                this.make(PlusSpawn, {}, px[0], px[1])
            } else {
                this.tiles[y][x] = i_src
            }
        }

    }

    is_solid_xywh(xywh: XYWH, dx: number, dy: number) {
        return !!this.get_solid_xywh(xywh, dx, dy)
    }

    get_solid_xywh(xywh: XYWH, dx: number, dy: number) {
        let { x, y, w, h } = xywh

        return this.is_solid_rect(x - w / 2 + dx, y - h / 2 + dy, w, h)
    }

    is_solid_rect(x: number, y: number, w = 1, h = 1) {

        let grid_width = this.tiles[0].length
        let grid_height = this.tiles.length

        let grid_x = x / 8
        let grid_y = y / 8
        let grid_end_x = (x + w - 1) / 8
        let grid_end_y = (y + h - 1) / 8

        if (grid_x < 0 || grid_end_x >= grid_width || grid_y < 0 || grid_end_y >= grid_height) {
            return true
        }

        for (x = grid_x; x <= grid_end_x; x++) {
            for (y = grid_y; y <= grid_end_y; y++) {
                x = Math.floor(x)
                y = Math.floor(y)
                if (is_solid_n(this.tiles[y][x])) {
                    return [x * 8, y * 8]
                }
            }
        }
        return undefined
    }



    _update() {

        let p = this.one(Player)

        // p movement
        if (p) {

            if (p && p.ledge_grab === undefined) {
                let down_solid = this.is_solid_xywh(p, 0, 4)
                let r_solid = !this.get_solid_xywh(p, 1, -8) ? this.get_solid_xywh(p, 1, 0) : undefined
                let l_solid = !this.get_solid_xywh(p, -1, -8) ? this.get_solid_xywh(p, -1, 0) : undefined

                // ledge grap
                if (!down_solid) {
                    if (p.is_right && Array.isArray(r_solid)) {
                        p.ledge_grab = .4
                        p.x = r_solid[0]
                        p.y = r_solid[1]
                    } else if (p.is_left && Array.isArray(l_solid)) {
                        p.ledge_grab = .4
                        p.x = l_solid[0] + 8
                        p.y = l_solid[1]
                    }
                }
            }

            if (p && p.ledge_grab === undefined && p.knoll_climb === undefined) {
                let r_knoll = !this.get_solid_xywh(p, 1, -8) ? this.get_solid_xywh(p, 1, 0) : undefined
                let l_knoll = !this.get_solid_xywh(p, -1, -8) ? this.get_solid_xywh(p, -1, 0) : undefined

                if (p.is_right && Array.isArray(r_knoll)) {
                    p.knoll_climb = .16
                    p.x = r_knoll[0]
                    p.y = r_knoll[1] - 1
                } else if (p.is_left && Array.isArray(l_knoll)) {
                    p.knoll_climb = -.16
                    p.x = l_knoll[0] + 8
                    p.y = l_knoll[1] - 1
                }
            }


            let s = this.get_solid_xywh(p, 0, 0) as [number, number]

            if (p.ledge_grab !== undefined) {
                p.ledge_grab = appr(p.ledge_grab, 0, Time.dt)


                if (p.ledge_grab === 0) {
                    p.ledge_grab = undefined


                    p.y = s[1] - 8
                    p.dy = 0
                }
            }

            if (p.knoll_climb !== undefined) {
                p.knoll_climb = appr(p.knoll_climb, 0, Time.dt)

                if (p.knoll_climb === 0) {
                    p.knoll_climb = undefined

                    p.y = s[1] - 8
                    p.dy = 0

                }
            } else {



                let G = _G

                {
                    let sign = Math.sign(p.dy)
                    let dy = Math.abs(p.dy + p.rem_y)
                    p.rem_y = (dy % 1) * sign


                    for (let di = 0; di < dy; di += 1) {
                        let dyy = 1 / 2 * sign * Time.dt * Time.dt * v_accel
                        if (this.is_solid_xywh(p, 0, dyy)) {
                            p.collide_v = sign
                            p.dy /= 2
                            break
                        } else {
                            p.collide_v = 0
                            p.y += dyy;

                            {
                                let dii = G
                                let sign = 1

                                p.dy += sign * dii * Time.dt
                            }
                        }
                    }
                }

                if (p.dy > -50) {
                    let dy = (fall_max_accel_y * G)
                    let sign = 1

                    for (let di = 0; di < dy; di += 1) {
                        let dyy = 1 / 2 * sign * Time.dt * Time.dt
                        if (this.is_solid_xywh(p, 0, dyy)) {
                            p.collide_v = sign
                            p.dy = 0
                            break
                        } else {
                            p.collide_v = 0
                            p.y += dyy
                        }
                    }
                }


                let sign = Math.sign(p.dx)
                let dx = Math.abs(p.dx + p.rem_x)
                p.rem_x = (dx % 1) * sign

                let v_damping = p.dy === 0 ? 1 : 0.8
                let s_damping = p.shoot_cool > 0 ? 0.66 : 1

                for (let i = 0; i < dx; i++) {
                    let dxx = sign * Time.dt * h_accel * v_damping * s_damping
                    if (this.is_solid_xywh(p, dxx, 0)) {
                        p.collide_h = sign
                        p.dx = 0
                        break
                    } else {
                        p.collide_h = 0
                        p.x += dxx
                    }
                }




                if (this.cam_zone_x < (p.x - 8) - 30) {
                    this.cam_zone_x = (p.x - 8) - 30
                }
                if (this.cam_zone_x > (p.x + 8) + 30) {
                    this.cam_zone_x = (p.x + 8) + 30
                }
                if (this.cam_zone_y < (p.y - 8) - 30) {
                    this.cam_zone_y = (p.y - 8) - 30
                }
                if (this.cam_zone_y > (p.y + 8) + 30) {
                    this.cam_zone_y = (p.y + 8) + 30
                }

                let show_more = p.dx < 0 ? -170 : p.dx > 0 ? -150 : -160
                this.cam_x = lerp(this.cam_x, this.cam_zone_x + show_more)
                this.cam_y = lerp(this.cam_y, this.cam_zone_y - 90, 0.5)

                this.cam_x = Math.min(Math.max(0, this.cam_x), this.w * 8 - 320)

            }

            if (p.shoot_cool > 0) {
                this.shake_dx = -1
                this.shake_dy = -.2
            }
        }

        let bs = this.many(Bullet)

        if (p) {

            let leader = this.one(TwoChar)?.position ?? Vec2.zero
            let c1s = this.many(OneChar)


            c1s.forEach(c1 => {
                let b = bs.find(b => collide_rect(c1.hitbox, b.hitbox))
                if (b) {
                    this.make(OneTimeAnim, {
                        name: 'one_char',
                        tag: 'hit',
                        duration: .8,
                    }, c1.x, c1.y)
                    c1.remove()
                    b.t_hit = true
                    this.bar.width++

                }
            })




            c1s.forEach(c1 => {
                c1.set_behaviors([
                    [SteerBehaviors.SeparationSteer(c1s.filter(_ => _ !== c1).map(_ => _.position)), 0.1],
                    [SteerBehaviors.ArriveSteer(leader, p.position.y), 0.2],
                    [SteerBehaviors.AvoidCircleSteer(Circle.make(p.position.x, p.position.y, 10)), 0.1],
                ])

            })

        }

        if (p) {

            let c2s = this.many(TwoChar)


            c2s.forEach(c2 => {
                let b = bs.find(b => collide_rect(c2.hitbox, b.hitbox))
                if (b) {
                    if (c2.damage === 0) {
                        for (let i = 0; i < 2; i++)
                            this.make(OneTimeAnim, {
                                name: 'two_char',
                                tag: 'split',
                                duration: .8,
                                end_make: [OneChar, {}]
                            }, c2.x, c2.y)
                        c2.remove()
                    } else {
                        c2.t_hit = .3
                    }
                    b.t_hit = true
                }
            })

            c2s.forEach(c2 => {
                if (c2.t_hit) {

                    c2.set_behaviors([
                        [SteerBehaviors.AvoidCircleSteer(Circle.make(p.x, p.y, 200)), 0.7],
                        [SteerBehaviors.NoSteer, 0.3]
                    ])
                    c2.set_opts(c2.damage_opts)
                } else {
                    c2.set_behaviors([
                        [SteerBehaviors.SeparationSteer(c2s.filter(_ => _ !== c2).map(_ => _.position)), 0.1],
                        [SteerBehaviors.ArriveSteer(p.position, 8), 0.2],
                        [SteerBehaviors.ArriveSteer(Vec2.make(Math.abs(Math.sin(this.life * 0.2)) * this.w * 8, p.position.y), 8), 0.2],
                        [SteerBehaviors.AvoidCircleSteer(Circle.make(p.x, p.y, 90)), 0.4]
                    ])
                    c2.set_opts(c2.normal_opts)
                }
            })

        }

        bs.forEach(b => {

            let sign = Math.sign(b.dx)
            let dx = Math.abs(b.dx + b.rem_x)
            b.rem_x = (dx % 1) * sign

            for (let i = 0; i < dx; i++) {
                let dxx = sign * Time.dt * h_accel
                if (this.is_solid_xywh(b, dxx, 0)) {
                    b.collide_h = sign
                    b.dx = 0
                    break
                } else {
                    b.collide_h = 0
                    b.x += dxx
                }
            }
        })


        let ps = this.many(PlusChar)

        ps.forEach(pc => {
            let sign = Math.sign(pc.dx)
            let dx = Math.abs(pc.dx + pc.rem_x)
            pc.rem_x = (dx % 1) * sign

            for (let i = 0; i < dx; i++) {
                let dxx = sign * Time.dt * h_accel
                if (this.is_solid_xywh(pc, dxx, 0)) {
                    pc.collide_h = sign
                    pc.dx = -pc.dx
                    break
                } else {
                    pc.collide_h = 0
                    pc.x += dxx
                }
            }

            if (p) {
                if (p.t_knock === undefined) {
                    if (p.falling && collide_rect(pc.hitbox, p.jumpbox)) {
                        pc.t_jumped = .3
                        p.dy = -max_jump_dy * 1.6
                    } else if (collide_rect(pc.hitbox, p.hurtbox)) {
                        p.t_knock = .8
                        p.dy = -max_jump_dy
                        p.dx = (p.dx === 0 ? Math.sign(pc.dx) : -Math.sign(p.dx)) * max_dx * 2
                    }
                }
            }

        })

        if (this.shake_dx !== 0) {
            this.cam_shake_x = this.shake_dx * Math.sin(2 * Math.PI * 0.2 * this.life) 
            this.cam_shake_x += this.shake_dx * Math.random() * 1
        }
         if (this.shake_dy !== 0) {
            this.cam_shake_y = this.shake_dy * Math.cos(2 * Math.PI * 100 * Time.dt)
            this.cam_shake_y += this.shake_dy * Math.random()
        }
        

        this.shake_dx = appr(this.shake_dx, 0, Time.dt * 100)
        this.shake_dy = appr(this.shake_dy, 0, Time.dt * 100)
    }

    _pre_draw(g: Graphics) {
        g.push_xy(-this.cam_x + this.cam_shake_x, -this.cam_y + this.cam_shake_y)
    }

    _post_draw(g: Graphics) {
        g.pop()
    }

    _draw(g: Graphics) {

        for (let i = 0; i < this.w; i++) {
            for (let j = 0; j < this.h; j++) {
                let tile = this.tiles[j][i]
                g.tile(tile, i * 8, j * 8)
            }
        }
    }
}

class HasPosition extends Play {

    anim!: Anim
    w = 16
    h = 16

    dx = 0
    dy = 0
    rem_x = 0
    rem_y = 0

    collide_h = 0
    collide_v = 0

    get hitbox() {
        let { x, y, w, h } = this
        return { x: x - w / 2, y: y - h/ 2, w, h }
    }

    _pre_draw(g: Graphics) {
        g.push_xy(this.x, this.y)
    }

    _post_draw(g: Graphics) {
        g.pop()
    }
}

class PlusChar extends HasPosition {

    t_jumped?: number

    _init() {
        this.anim = this.make(Anim, {name: 'plus_char'})
        this.dx = max_dx /2
    }

    _update() {
        if (this.t_jumped !== undefined) {
            this.t_jumped = appr(this.t_jumped, 0, Time.dt)

            if (this.t_jumped === 0) {
                this.t_jumped = undefined
            }
        }

        if (this.t_jumped !== undefined) {
            this.anim.scale_y = appr(this.anim.scale_y, 0.8, Time.dt * 1.8)
            this.anim.scale_x = appr(this.anim.scale_x, 1.2, Time.dt * 1.6)
            this.anim.play_tag('jumped')
        } else {

            this.anim.scale_y = appr(this.anim.scale_y, 1, Time.dt)
            this.anim.scale_x = appr(this.anim.scale_x, 1, Time.dt)
            this.anim.play_tag('idle')
        }
    }
}

class PlusSpawn extends HasPosition {
    _init() {
        this.parent!.make(PlusChar, {}, this.x, this.y)
    }
    _update() {
        if (this.parent.many(PlusChar).length < 2) {
            if (Time.on_interval(1)) {
                this.parent!.make(PlusChar, {}, this.x, this.y)
            }
        }
    }
}

class TwoSpawn extends HasPosition {

    _init() {
        this.parent!.make(TwoChar, {}, this.x, this.y)
    }

    _update() {
        if (this.parent.many(TwoChar).length < 5) {
            if (Time.on_interval(1)) {
                this.parent!.make(TwoChar, {}, this.x, this.y)
            }
        }
    }
}


abstract class HasSteer extends HasPosition {

    abstract opts: RigidOptions
    readonly behaviors: WeightedBehavior[] = [
        [SteerBehaviors.NoSteer, 1]
    ]

    public steer!: SteerBehaviors

    is_lock_x?: boolean

    init() {
        this.steer = new SteerBehaviors(this.opts, this.behaviors)
        return super.init()
    }

    set_behaviors(bs: WeightedBehavior[]) {
        this.behaviors.length = 0
        this.behaviors.push(...bs)
    }

    set_opts(opts: RigidOptions) {
        this.steer.opts = opts
    }

    update() {

        if (this.is_lock_x === undefined) {
            this.steer.lock_force = Vec2.unit
        } else if (this.is_lock_x) {
            this.steer.lock_force = Vec2.make(1, 0)
        } else {
            this.steer.lock_force = Vec2.make(0, 1)
        }


        this.steer.update(Time.dt, Time.dt0)

        let { x, y } = this.steer.position
        this.x = x
        this.y = y

        super.update()
    }
}


type OneTimeAnimData = {
    name: string,
    tag?: string,
    duration?: number,
    on_end?: () => void
    end_make?: [new(x: number, y: number) => Play, any]
}

class OneTimeAnim extends HasPosition {

    get data() {
        return this._data as OneTimeAnimData
    }

    get duration() {
        return this.data.duration ?? 1
    }

    _init() {
        let { name, tag } = this.data
        this.anim = this.make(Anim, { name, tag, duration: this.duration })
    }

    _update() {

        if (this.life > this.duration) {
            this.data.on_end?.()
            if (this.data.end_make) {
                let [ctor, data] = this.data.end_make
                this.parent!.make(ctor, data, this.x, this.y)
            }
            this.remove()
        }
    }
}

class OneChar extends HasSteer {

    readonly opts: RigidOptions = {
        mass: 0.002,
        air_friction: 0.99,
        max_speed: 400,
        max_force: 280,
        x0: this.x,
        y0: this.y
    }

    _init() {
        this.anim = this.make(Anim, { name: 'one_char' })
    }

}

class TwoChar extends HasSteer {

    w = 32
    h = 32
    t_hit?: number

    damage = 2

    readonly normal_opts: RigidOptions = {
        mass: 0.02,
        air_friction: 0.98,
        max_speed: 300,
        max_force: 180,
        x0: this.x,
        y0: this.y
    }

    readonly damage_opts = {
        mass: 0.001,
        air_friction: 0.8,
        max_speed: 5000,
        max_force: 2000,
        x0: this.x,
        y0: this.y
    }

    readonly opts = this.normal_opts

    _init() {
        this.anim = this.make(Anim, { name: 'two_char' })

        this.is_lock_x = true
    }


    _update(){ 

        if (Time.on_interval(3)) {
            if (this.is_lock_x !== undefined) {
                this.is_lock_x = !this.is_lock_x
            }
        } 


        if (this.t_hit) {
            this.is_lock_x = undefined
            this.anim.play_tag('damage')
            this.t_hit = appr(this.t_hit, 0, Time.dt)


            if (this.t_hit === 0) {
                this.is_lock_x = true
                this.t_hit = undefined
                this.damage-=1
            }
        } else {
            this.anim.play_tag('idle')
        }
    }

}

class Player extends HasPosition {

    is_right = false
    is_left = false

    ledge_grab?: number
    knoll_climb?: number

    t_knock?: number

    _up_counter?: number
    _ground_counter?: number
    _double_jump_left = 2

    shoot_cool = 0

    pre_grounded = this.grounded
    pre_y = this.y

    get jumpbox() {
        return { x: this.hitbox.x, y: this.hitbox.y, w: this.w * 1.2, h: this.h }
    }
    get hurtbox() {
        return { x: this.hitbox.x, y: this.hitbox.y, w: this.w * 0.8, h: this.h * 0.7 }
    }

    get jumping() {
        return this.pre_y > this.y
    }

    get falling() {
        return this.pre_y < this.y
    }

    facing: number = 1

    get grounded() {
        return this.collide_v > 0
    }

    _init() {
        this.anim = this.make(Anim, { name: 'main_char' })
    }

    _update() {

        if (this.t_knock !== undefined) {
            this.t_knock = appr(this.t_knock, 0, Time.dt)

            if (this.t_knock === 0) {
                this.t_knock = undefined
            }
        }


        if (this.dx !== 0) {
           this.facing = Math.sign(this.dx)
        }

        let is_left = i('ArrowLeft') || i('a')
        let is_right = i('ArrowRight') || i('d')
        let is_up = i('ArrowUp') || i('w')
        let is_shoot = i(' ') || i('x')

        this.is_left = is_left
        this.is_right = is_right

        if (is_left) {
            let accel = this.dx > 0 ? 40: 30
            this.dx = appr(this.dx, -max_dx, Time.dt * accel)
        } else if (is_right) {
            let accel = this.dx < 0 ? 40: 30
            this.dx = appr(this.dx, max_dx, Time.dt * accel)
        } else {
            this.dx = appr(this.dx, 0, Time.dt * 66)
        }



        if (is_up) {
            if (this._up_counter !== undefined) {
                this._up_counter += Time.dt
            }
        } else {
            if (this._up_counter === undefined) {

                this._up_counter = 0
            } else if (this._up_counter > 0) {
                this._up_counter = -0.3
            }
        }

        if (this._up_counter !== undefined) {
            if (this._up_counter < 0) {
                this._up_counter += Time.dt
                if (this._up_counter >= 0) {
                    this._up_counter = undefined
                }
            }
        }

        if (this._up_counter !== undefined) {
            if (this._up_counter > 0) {
                if (this._ground_counter !== undefined) {
                    this.dy = -max_jump_dy
                    this._up_counter = undefined
                    this._double_jump_left = 1
                    a.play('jump')
                } else if (this._double_jump_left > 0) {
                    this.dy = -max_jump_dy
                    this._up_counter = undefined
                    this._double_jump_left = 0

                    a.play('djump')
                    /*
                    let _ = this.parent!.make(Fx, { name: 'fx_djump', duration: 0.4 })
                    _.x = this.x
                    _.y = this.y + 5
                    */
                }
            }
        }


        if (this.grounded) {
            this._ground_counter = 0
        } else {
            if (this.pre_grounded) {
                this._ground_counter = .16
            }
        }

        if (this._ground_counter !== undefined) {
            if (this._ground_counter > 0) {
                this._ground_counter = appr(this._ground_counter, 0, Time.dt)

                if (this._ground_counter === 0) {
                    this._ground_counter = undefined
                }
            }
        }

        if (this.t_knock !== undefined) {
            this.anim.play_tag('knock')
        } else if (this.ledge_grab !== undefined) {
            this.anim.play_tag('ledge')
        } else if (this.grounded) {
            if (this.dx !== 0) {
                this.anim.play_tag('run')
                this.anim.scale_x = this.facing
            } else {
                this.anim.play_tag('idle')
            }
        } else {
            if (this.jumping) {
               this.anim.play_tag('jump')
            } else {
                this.anim.play_tag('fall')
            }
        }

        if (Math.sign(this.anim.scale_x) !== this.facing) {
            this.anim.scale_x *= -1
        }

        if (this.jumping) {
            this.anim.scale_x = appr(this.anim.scale_x, this.facing * 0.8, Time.dt * 0.9)
            this.anim.scale_y = appr(this.anim.scale_y, 1.16, Time.dt * 0.9)
        } else {
            this.anim.scale_x = appr(this.anim.scale_x, this.facing, Time.dt)
            this.anim.scale_y = appr(this.anim.scale_y, 1, Time.dt)
        }

        if (!this.ledge_grab && !this.knoll_climb && is_shoot && this.shoot_cool === 0) {

            let f = this.parent!.make(BulletFlash)
            f.x = this.x + this.dx
            f.y = this.y - Math.random() * 8
            f.anim.scale_x = this.facing

            let _ = this.parent!.make(Bullet)
            _.x = this.x
            _.y = f.y
            _.dx = this.facing * max_dx * 2.5
            _.anim.scale_x = Math.sign(_.dx)
            _.base_x = _.x
            _.distance_long = (this.dx === 0 ? 60 : 110) + Math.random() * 30
            this.shoot_cool = .2
        }
        this.shoot_cool = appr(this.shoot_cool, 0, Time.dt)

        this.pre_grounded = this.grounded
        this.pre_y = this.y

        this.anim.x = - this.shoot_cool * this.facing * 12
    }
}

class Bullet extends HasPosition {

    w = 12
    h = 12
    base_x = 0
    distance_long = 120

    t_hit = false

    get distance() {
        return Math.abs(this.x - this.base_x)
    }

    _init() {
        this.anim = this.make(Anim, { name: 'bullet', duration: .1 })
        this.dy = (0.5 - Math.random()) * 40
    }


    _update() {
        this.anim.y += this.dy * Time.dt
        if (this.distance > this.distance_long || this.collide_h !== 0) {
            this.t_hit = true
        }

        if (this.t_hit) {
            let _ = this.parent!.make(BulletHit, { name: 'bullet', tag: 'hit' })
            _.x = this.x
            _.y = this.y
            _.anim.scale_x = this.anim.scale_x
            this.remove()
        }
    }
}


class BulletFlash extends HasPosition {

    _init() {
        this.anim = this.make(Anim, { name: 'bullet', tag: 'flash' + (Math.random() < 0.4 ? '2': ''), duration: .16 })
    }

    _update() {

        if (this.life >= .16) {
            this.remove()
        }
    }
}



class BulletHit extends HasPosition {

    _init() {
        this.anim = this.make(Anim, { name: 'bullet', tag: 'hit', duration: .4 })
    }

    _update() {

        if (this.life >= .4) {
            this.remove()
        }
    }
}


const solid_tiles = [0, 1, 2, 3, 4, 5, 20, 21, 22, 23, 24, 40, 41, 42, 44, 60, 61, 62, 63, 64, 80, 81, 82, 83]
const is_solid_n = (n: number) => solid_tiles.includes(n)