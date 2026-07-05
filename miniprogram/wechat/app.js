App({
  globalData: {
    openid: '',
    cloudReady: false,
  },

  onLaunch() {
    this.globalData.cloudReady = Boolean(wx.cloud)
  },
})
