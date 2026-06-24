App({
  globalData: {
    openid: '',
    cloudReady: false,
  },

  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({ env: 'cloud1-d5g01k4t5decfcc5c', traceUser: true })
      this.globalData.cloudReady = true
    }
  },
})
