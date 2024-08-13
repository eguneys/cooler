import Time from './time'
import Content from './content'
import Graphics from './graphics'

export default abstract class Play {

  _data: any

  _set_data(data: any) {
    this._data = data
    return this
  }

  life!: number
  objects: Play[]
  pools: [Play, number][]

  _scheds: [number, () => void][]

  sched(n: number, p: () => void) {
    this._scheds.push([n, p])
  }


  constructor() {
    this.pools = []
    this.objects = []
    this._scheds = []
  }


  many<T extends Play>(ctor: { new(): T}): T[] {
    return this.objects.filter(_ => _ instanceof ctor) as T[]
  }



  one<T extends Play>(ctor: { new(): T}): T | undefined {
    return this.objects.find(_ => _ instanceof ctor) as T | undefined
  }

  _make<T extends Play>(ctor: { new (): T }, data: any) {
    let res = new ctor()._set_data(data).init()
    return res
  }

  make<T extends Play>(ctor: { new (): T }, data: any = {}) {
    let res = this._make(ctor, data)
    this.objects.push(res)
    return res
  }

  pool<T extends Play>(ctor: { new (): T }, data: any = {}, n = 7) {
    let res = this._make(ctor, data)
    this.objects.push(res)
    this.pools.push([res, n])

    return res
  }

  remove(p: Play) {
    let i = this.objects.indexOf(p)
    if (i === -1) {
      throw 'noscene rm'
    }
    this.objects.splice(i, 1)

    i = this.pools.findIndex(([o]) => o === p)
    if (i !== -1) {
      this.pools.splice(i, 1)
    }

  }

  init() {

    this.life = 0

    this._init()
    return this
  }

  update() {
    if (this.life === 0) {
      this._first_update()
    }
    this.objects.forEach(_ => _.update())
    this.life += Time.dt

    this._scheds = this._scheds.map<[number, () => void]>(([n, p]) => {
      if (n - Time.dt < 0) {
        p()
      }
      return [n - Time.dt, p]
    }).filter(_ => _[0] > 0)

    this.pools.slice(0).forEach(([o, l]) => {
      let ls = this.pools.filter(_ => _[0].constructor.name === o.constructor.name)

      if (ls.length > l) {
        let o = ls[0][0]
        this.remove(o)
      }
    })

    this._update()
  }

  draw(graphics: Graphics) {
    this._pre_draw(graphics)
    this.objects.forEach(_ => _.draw(graphics))
    this._draw(graphics)
    this._post_draw(graphics)
  }


  _init() {}
  _first_update() {}
  _update() {}
  _draw(_: Graphics) {}
  _pre_draw(_: Graphics) {}
  _post_draw(_: Graphics) {}
}

export type SOrigin = 'c' | 'bc' | 'tl'

export type AnimData = {
  name: string,
  tag?: string,
  s_origin?: SOrigin,
  duration?: number
}

export class Anim extends Play {

  get data() {
    return this._data as AnimData
  }

  private get info() {
    let res = Content.info.find(_ => _.name === this._name)
    if (!res) {
      throw `nosprite ${this._name}`
    }
    return res
  }

  get duration() {
    return this.data.duration ?? 400
  }

  private get tag() {
    let res = this.info.tags.find(_ => _.name === this._tag)
    if (!res) {
      throw `notag ${this._name} ${this._tag}`
    }
    return res
  }

  private get _name() {
    return this.data.name
  }

  private get _tag() {
    return this.data.tag || 'idle'
  }

  x = 0
  y = 0
  scale_x = 1
  scale_y = 1

  xy(x: number, y: number) {
    this.x = x
    this.y = y
  }

  _current_frame = 0

  get current_frame() {
    let { from } = this.tag
    return this.info.packs[this._current_frame + from]
  }

  get s_origin() {
    return this.data.s_origin ?? 'c'
  }

  get origin_x() {
    if (this.s_origin === 'tl') {
      return 0
    }
    let { fw } = this.current_frame

    if (this.s_origin === 'c' || this.s_origin === 'bc') {
      return fw / 2
    }
    return 0
  }

  get origin_y() {
    if (this.s_origin === 'tl') {
      return 0
    }
    let { fh } = this.current_frame

    if (this.s_origin === 'c') {
      return fh / 2
    }
    if (this.s_origin === 'bc') {
      return fh
    }
    return 0
  }

  play_tag(tag: string) {
    this.data.tag = tag
    this._current_frame = 0

    this.__elapsed = 0
  }

  __elapsed = 0

  _update() {
    let { from, to } = this.tag
    let { duration } = this
    let duration_single_frame = duration / (to - from + 1)

    let d_from_to = to - from

    this.__elapsed += Time.dt * 1000

    if (this.__elapsed >= duration_single_frame) {
      this.__elapsed -= duration_single_frame

      if (this._current_frame === d_from_to) {
        this._current_frame = 0
      } else {
        this._current_frame += 1
      }
    }

  }

  _draw(graphics: Graphics) {
    let { x, y, scale_x, scale_y } = this

    graphics.anim(this, x, y, scale_x, scale_y)
  }

}