import Content from './content'
import Graphics from "./graphics"
import Play, { Anim } from "./play"
import i from "./input"
import a from './sound'
import Time, { my_loop } from "./time"

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

    const go = (scene_ctor: { new(): Scene }) => {
        scene = new scene_ctor()
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
        return this._data as { g: Graphics, go: (_: { new(): Scene }) => void}
    }

    get g() {
        return this.data.g
    }

    go(_: { new(): Scene }) {
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
        let _ = this.make(Anim, { name: 'loading', tag: 'audio', duration: 1000 })
        _.x = 320 / 2
        _.y = 180 / 2

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

        let _ = this.make(Anim, { name: 'loading', tag: 'input', duration: 1000 })
        _.x = 260
        _.y = 160
    }
}


class Intro extends Scene {

    _init() {
        this.song = a.play('song', true)

        this.make(MapLoader)
    }
}


class MapLoader extends Play {

    w!: number
    h!: number
    tiles!: number[][]

    cam_x = 0
    cam_y = 0
    cam_zone_x = 0
    cam_zone_y = 0 

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
                let _ = this.make(Player)
                _.x = px[0]
                _.y = px[1]
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
                return
            }

            if (p.knoll_climb !== undefined) {
                p.knoll_climb = appr(p.knoll_climb, 0, Time.dt)

                if (p.knoll_climb === 0) {
                    p.knoll_climb = undefined

                    p.y = s[1] - 8
                    p.dy = 0

                }
                return
            }



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

            for (let i = 0; i < dx; i++) {
                let dxx = sign * Time.dt * h_accel * v_damping
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
            if (this.cam_zone_y < p.y - 8) {
                this.cam_zone_y = p.y - 8
            }
            if (this.cam_zone_y > p.y + 8) {
                this.cam_zone_y = p.y + 8
            }

            let show_more = p.dx < 0 ? -170 : p.dx > 0 ? -150 : -160
            this.cam_x = lerp(this.cam_x, this.cam_zone_x + show_more)
            this.cam_y = lerp(this.cam_y, this.cam_zone_y - 90, 0.5)

            this.cam_x = Math.min(Math.max(0, this.cam_x), this.w * 8 - 320)

        }
    }

    _pre_draw(g: Graphics) {
        g.push_xy(-this.cam_x, -this.cam_y)
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
    x = 0
    y = 0

    dx = 0
    dy = 0
    rem_x = 0
    rem_y = 0

    collide_h = 0
    collide_v = 0

    _pre_draw(g: Graphics) {
        g.push_xy(this.x, this.y)
    }

    _post_draw(g: Graphics) {
        g.pop()
    }
}

class Player extends HasPosition {

    is_right = false
    is_left = false

    ledge_grab?: number
    knoll_climb?: number

    _up_counter?: number
    _ground_counter?: number
    _double_jump_left = 2

    pre_grounded = this.grounded
    pre_y = this.y

    get jumping() {
        return this.pre_y > this.y
    }

    get falling() {
        return this.pre_y < this.y
    }

    get facing() {
        return Math.sign(this.dx)
    }

    get grounded() {
        return this.collide_v > 0
    }

    _init() {
        this.anim = this.make(Anim, { name: 'main_char' })
    }

    _update() {
        let is_left = i('ArrowLeft') || i('a')
        let is_right = i('ArrowRight') || i('d')
        let is_up = i('ArrowUp') || i('w')

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

        if (this.ledge_grab !== undefined) {
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
            if (this.facing !== 0) {
               this.anim.scale_x = this.facing
            }
        }

        this.pre_grounded = this.grounded
        this.pre_y = this.y
    }
}



const solid_tiles = [0, 1, 2, 3, 4, 5, 20, 21, 22, 23, 24, 40, 41, 42, 44, 60, 61, 62, 63, 64, 80, 81, 82, 83]
const is_solid_n = (n: number) => solid_tiles.includes(n)