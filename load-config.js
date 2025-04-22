function loadScript (url, onSuccess, onError) {
  const script = document.createElement('script')
  script.src = url
  script.onload = onSuccess
  script.onerror = onError
  document.head.appendChild(script)
}

loadScript(
  'server_config.js',
  () => {
    console.log('✅ Loaded server_config.js')
    startApp() //  start only AFTER config is ready
  },
  () => {
    console.warn('⚠️ server_config.js not found, trying fallback...')
    loadScript(
      'server_config.example.js',
      () => {
        console.log('✅ Loaded server_config.example.js')
        startApp() // 💥 start AFTER fallback config is ready
      },
      () => {
        console.error('❌ Failed to load any config file!')
      }
    )
  }
)
