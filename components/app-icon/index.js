// components/app-icon/index.js 通用图标组件（emoji / 图片 二选一）
//
// 【解决什么问题】
//   项目里图标都放在一个 icon 字段里，以前只能写 emoji（'✅'）。
//   一旦写成图片路径，页面会把它当文字画出来。这个组件统一处理：
//   是图片路径就用 <image>，否则用 <text>，调用方不用写 wx:if。
//
// 【用法】
//   <app-icon icon="{{item.icon}}" size="60rpx" radius="20rpx" bg="{{item.color}}" />
//   数据里两种写法都合法：
//     { icon: '✅' }                          → emoji
//     { icon: '/images/111/detect.png' }      → 图片（推荐带开头的 /）
//     { icon: 'images/111/detect.png' }       → 也能识别，组件自动补上 /
//
// 【为什么要自动补 "/"】
//   WXML 里的相对路径按"当前文件所在目录"解析，
//   index.wxml 里写 images/xxx.png 会去找 pages/index/images/xxx.png，必然找不到。
//   "/" 代表项目根目录，所以组件统一帮调用方补上，少踩一次坑。
Component({
  options: {
    // 让页面的 CSS 变量（--fs 字号倍数等）能传进组件内
    styleIsolation: 'apply-shared'
  },

  properties: {
    icon: { type: String, value: '' },      // emoji 或图片路径
    size: { type: String, value: '60rpx' }, // 正方形边长
    radius: { type: String, value: '20rpx' },
    fs: { type: String, value: '32rpx' },   // emoji 字号（图片模式不用）
    bg: { type: String, value: 'transparent' },
    fit: { type: String, value: 'aspectFit' }, // aspectFit 完整显示 / aspectFill 裁满
    gray: { type: Boolean, value: false }   // 置灰（待开发工具这类占位卡）
  },

  data: {
    isImg: false,
    src: ''
  },

  observers: {
    icon(v) {
      this.setData(this._parse(v))
    }
  },

  lifetimes: {
    attached() {
      // 低版本基础库初始赋值时 observers 可能不触发，这里补一次
      this.setData(this._parse(this.data.icon))
    }
  },

  methods: {
    /**
     * 判断 icon 是图片还是 emoji
     *   · 以 / 开头            → 图片（绝对路径，直接用）
     *   · 以图片扩展名结尾      → 图片（相对路径，补上 /）
     *   · 其它                 → emoji，交给 <text>
     */
    _parse(v) {
      const s = typeof v === 'string' ? v.trim() : ''
      const isImg = /^\//.test(s) || /\.(png|jpe?g|gif|webp|svg)$/i.test(s)
      return {
        isImg,
        src: isImg && s.charAt(0) !== '/' ? '/' + s : s
      }
    }
  }
})
