let socket
let gameId
let username
let songCount = 0
let userHostingSpotifySession = false

function getServerUrl () {
  const configValue =
    (window.TRACK_BACK_CONFIG || {}).TRACK_BACK_SERVER_URL || ''

  return configValue || ''
}

function startApp () {
  serverUrl = getServerUrl()
}

let currentGuessSong = null
let pauseAfterGuess = false
let queuedTurn = null

const WRONG_GUESS_DISPLAY_TIME = 1500 // How long the wrong guess stays visible
const FADE_DURATION = 500 // Duration of fade-out animation

const log = msg => {
  const logBox = document.getElementById('log')
  logBox.textContent += msg + '\n'
  logBox.scrollTop = logBox.scrollHeight
}

const targetSongCountInput = document.getElementById('targetSongCountInput')

targetSongCountInput.addEventListener('input', () => {
  let value = targetSongCountInput.value.trim()

  // Only allow positive integers
  if (!/^\d+$/.test(value) || parseInt(value) <= 0) {
    targetSongCountInput.value = '' // Clear invalid input
  }
})

const buildSongEntry = (song, id = '', extra = '') => {
  return `
    <div class="song-entry ${extra}" ${id ? `id="${id}"` : ''}>
      <img src="${
        song.album_cover_url
      }" alt="cover" class="song-cover" onerror="this.src='dummy-cover/cover1.png'" />
      <div class="song-details">
        <strong>${song.title}</strong> (${song.release_year})<br />
        by ${song.artist}
      </div>
    </div>
  `
}

const buildSongListHtml = (list, newSong) => {
  const entries = list.map(
    (s, i) => `
    <div class="song-entry" draggable="false" data-index="${i}">
      <img src="${s.album_cover_url}" alt="cover" class="song-cover" onerror="this.src='dummy-cover/cover1.png'" />
      <div class="song-details">
        <strong>${s.title}</strong> (${s.release_year})<br />
        by ${s.artist}
      </div>
    </div>
  `
  )

  const newEntry = `
    <div class="song-entry highlight" id="new-song">
      <img src="${newSong.album_cover_url}" alt="cover" class="song-cover"  onerror="this.src='dummy-cover/cover1.png'" />
      <div class="song-details">
        <strong>Drag the song to the right place in the timeline.</strong>
      </div>
    </div>
  `

  return newEntry + entries.join('')
}

function handleYourTurn (data) {
  if (pauseAfterGuess) {
    queuedTurn = data
    return
  }
  const isMyTurn = data.next_player === username
  if (!isMyTurn) {
    return
  }

  document.getElementById('songListHeader').style.display = 'block'
  document.getElementById('songTimeline').style.display = 'block'
  document.getElementById('songCount').style.display = 'block'
  document.getElementById('controls-waiting-for-start').hidden = true

  const list = data.song_list || []
  const dummyCovers = [
    'dummy-cover/cover1.png',
    'dummy-cover/cover2.png',
    'dummy-cover/cover3.png',
    'dummy-cover/cover4.png',
    'dummy-cover/cover5.png',
    'dummy-cover/cover6.png'
  ]
  const randomCover =
    dummyCovers[Math.floor(Math.random() * dummyCovers.length)]

  document.getElementById('newSongContainer').innerHTML = `
    <div class="song-entry highlight" id="new-song">
      <img src="${randomCover}" alt="cover" class="song-cover" />
      <div class="song-details">
        <strong>Drag the song to the right place in the timeline.</strong>
      </div>
    </div>
  `

  document.getElementById('newSongContainer').style.display = 'block'

  document.getElementById('songCount').textContent = `Song count: ${songCount}`

  document.getElementById('songTimeline').innerHTML = list
    .map(s => buildSongEntry(s))
    .join('')

  setupDragDrop()
}

function handleGuessResult (data) {
  if (data.result === 'correct') {
    log(`✅ Guess was correct: ${data.message}`)
    songCount += 1
    document.getElementById(
      'songCount'
    ).textContent = `Song count: ${songCount}`
  } else {
    log(`❌ Guess was wrong: ${data.message}`)
  }

  const list = data.song_list || []

  const timeline = document.getElementById('songTimeline')

  // Always clear the new song container
  document.getElementById('newSongContainer').style.display = 'none'

  // Update the timeline first (without the guess)
  timeline.innerHTML = list.map(s => buildSongEntry(s)).join('')

  // If the guess was wrong, insert the incorrect guess at the user's chosen position
  if (data.result === 'wrong') {
    const wrongSong = data.last_song || {}
    const guessedIndex = data.last_index ?? 0

    const wrongSongHTML = `
          <div class="song-entry wrong-guess">
            <span class="wrong-label"></span>
            <img src="${wrongSong.album_cover_url}" alt="cover" class="song-cover" onerror="this.src='dummy-cover/cover1.png'" />
            <div class="song-details">
              <strong>${wrongSong.title}</strong> (${wrongSong.release_year})<br />
              by ${wrongSong.artist}
            </div>
          </div>
        `

    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = wrongSongHTML
    const wrongSongEl = tempDiv.firstElementChild

    const children = timeline.children

    if (guessedIndex >= 0 && guessedIndex < children.length) {
      timeline.insertBefore(wrongSongEl, children[guessedIndex])
    } else {
      timeline.appendChild(wrongSongEl)
    }

    // Fade out and remove after 5 seconds
    setTimeout(() => {
      wrongSongEl.classList.add('fade-out')
      setTimeout(() => {
        wrongSongEl.remove()
      }, FADE_DURATION)
    }, WRONG_GUESS_DISPLAY_TIME)

    pauseAfterGuess = true
    setTimeout(() => {
      pauseAfterGuess = false

      // If a turn came in while we were paused, now we handle it
      if (queuedTurn) {
        handleYourTurn(queuedTurn)
        queuedTurn = null
      }
    }, WRONG_GUESS_DISPLAY_TIME + FADE_DURATION)
  }
}

function connectWebSocket () {
  let urlObj = new URL(serverUrl)
  const wsProtocol = urlObj.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProtocol}//${urlObj.host}/ws/${gameId}/${username}`

  socket = new WebSocket(wsUrl)

  socket.onopen = () => {
    document.getElementById('game').style.display = 'block'
    log('🔌 Connected to game session.')
  }

  socket.onerror = e => {
    console.error('🚨 WebSocket error:', e)
    log('🚨 Connection error')
  }

  socket.onmessage = event => {
    const data = JSON.parse(event.data)
    const type = data.type

    if (type === 'your_turn') {
      handleYourTurn(data)
    } else if (type === 'guess_result' && data.player === username) {
      handleGuessResult(data)
    } else if (type === 'welcome') {
      log(`👋🏻 ${data.message}`)
    } else if (type === 'player_joined') {
      log(`👋🏻 ${data.message}`)
    } else if (type === 'game_start') {
      log(`🎮 ${data.message}`)
    } else if (type === 'error') {
      log(`🚨 Error: ${data.message}`)
    } else if (type === 'other_player_guess') {
      log(`🧑🏽‍🎤 ${data.message}`)
    } else if (type === 'game_over') {
      log(`🏁 Game Over! Winner: ${data.winner}`)

      document.getElementById('newSongContainer').style.display = 'none'

      const winnerHeader = document.getElementById('winnerHeader')
      const winnerIsYou = data.winner === username

      winnerHeader.innerHTML = winnerIsYou
        ? '🎉&thinsp;You win!&thinsp;🎉<br />👩🏻‍🎤&thinsp;🏆'
        : `Game over.<br />${data.winner} won the game.`

      winnerHeader.style.display = 'block'
    }
  }

  socket.onclose = () => {
    log('🔌 Connection closed.')
  }
}

async function listAndChooseGameSessions () {
  try {
    document.getElementById('joinGameConfigBox').hidden = false

    const res = await fetch(`${serverUrl}/list-sessions`)
    const data = await res.json()

    const sessions = data.sessions || []
    const dropdown = document.getElementById('sessionDropdown')
    const joinButton = document.getElementById('joinSelectedSessionBtn')

    // Clear previous options
    dropdown.innerHTML = ''

    if (sessions.length === 0) {
      alert('❌ No available game sessions.')
      return
    }

    // Fill the dropdown
    sessions.forEach((sessionId, index) => {
      const option = document.createElement('option')
      option.value = sessionId
      option.textContent = `${index + 1}. ${sessionId}`
      dropdown.appendChild(option)
    })

    joinButton.onclick = async () => {
      const selectedGameId = dropdown.value
      if (!selectedGameId) {
        alert('❌ Please select a session.')
        return
      }
      if (!userHostingSpotifySession) {
        document.getElementById('controls-waiting-for-start').hidden = false
      }
      gameId = selectedGameId
      await joinGame()
    }
  } catch (err) {
    console.error('❌ Failed to fetch sessions:', err)
    alert('⚠️ Failed to fetch game sessions.')
  }
}

async function joinGame () {
  try {
    const res = await fetch(`${serverUrl}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId, user_name: username })
    })
    const data = await res.json()
    if (!res.ok) {
      log(`❌ Failed to join game: ${data.detail}`)
      return
    }

    log(`✅ Joined game: ${gameId}`)
    connectWebSocket()
    if (userHostingSpotifySession) {
      document.getElementById('controls-start').hidden = false
    }
    document.getElementById('joinGameConfigBox').hidden = true
  } catch (err) {
    console.error('❌ Failed to join game:', err)
  }
}

async function configureGame () {
  username = document.getElementById('username').value

  if (!username) {
    alert('Please enter a username!')
    return
  }
  document.getElementById('gameConfigBox').hidden = false

  document.getElementById('controls-new-or-join').hidden = true

  document.getElementById('gameIdInput').value = `Game-by-${username}`
}

async function createGame () {
  serverUrl = getServerUrl()
  username = document.getElementById('username').value
  songCountInput = document.getElementById('targetSongCountInput').value.trim()

  // const groups = document.querySelectorAll('.input-group-configure-game')
  // groups.forEach(group => {
  //   group.hidden = true
  // })
  document.getElementById('gameConfigBox').hidden = true
  document.getElementById('controls-start').hidden = false

  targetSongCount = parseInt(songCountInput)

  if (isNaN(targetSongCount) || targetSongCount <= 0) {
    alert('⚠️ Please enter a valid number greater than 0 for songs!')
    return
  }

  const gameIdInput = document.getElementById('gameIdInput').value.trim()

  gameId = encodeURIComponent(gameIdInput)

  if (!gameId || !username) {
    alert('Please enter both a username and a game ID!')
    return
  }

  musicServiceType = document.getElementById('musicServiceDropdown').value

  if (musicServiceType === 'spotify') {
    // ✨ Spotify: first login
    const stateObject = {
      game_id: gameId,
      target_song_count: targetSongCount
    }

    const stateParam = encodeURIComponent(JSON.stringify(stateObject))

    const loginUrl = `${serverUrl}/spotify-login?state=${stateParam}`
    // spotify
    document.getElementById('joinGameBtn').innerHTML =
      'After login to Spotify: 📻&thinsp;🔑<br>Join the new game session 👋🏻'

    document.getElementById('controls-new-or-join').hidden = false
    document.getElementById('joinGameTitle').style.display = 'none'
    document.getElementById('sessionDropdown').style.display = 'none'

    document.getElementById('joinGameBtn').style.display = 'block'
    document.getElementById('controls-start').hidden = true

    document.getElementById('configureGameBtn').style.display = 'none'

    userHostingSpotifySession = true
    window.open(loginUrl, '_blank')

    log(`🎮 Created new spotify game session: ${gameId}`)
    // user returns later and clicks Join
  } else if (musicServiceType === 'applemusic') {
    try {
      // ✨ AppleMusic: direct creation

      const res = await fetch(`${serverUrl}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_id: gameId,
          target_song_count: targetSongCount,
          music_service_type: musicServiceType
        })
      })
      if (!res.ok) {
        const data = await res.json()
        log(
          `❌ Failed to create Apple Music game: ${
            data.detail?.error || 'Unknown error'
          }`
        )
        console.error('Detailed server error:', data)
        return
      }
    } catch (err) {
      console.error('❌ Failed to create apple music game:', err)
      return
    }
    console.error('Successfully created apple music game')

    await joinGame()
  }
}

document.getElementById('configureGameBtn').onclick = () => configureGame()
document.getElementById('createGameBtn').onclick = () => createGame()

document.getElementById('joinGameBtn').onclick = async () => {
  serverUrl = getServerUrl()
  username = document.getElementById('username').value

  if (!username) {
    alert('Please enter a username!')
    return
  }
  document.getElementById('controls-new-or-join').hidden = true

  const res = await fetch(`${serverUrl}/list-sessions`)
  const data = await res.json()

  if (!res.ok || !data.sessions.length) {
    alert('❌ No game sessions available to join.')
    return
  }
  if (userHostingSpotifySession) {
    await joinGame()
    return
  } else {
  }
  // Ask the user to pick one session
  await listAndChooseGameSessions()
}

document.getElementById('startGameBtn').onclick = async () => {
  serverUrl = getServerUrl()

  try {
    const res = await fetch(`${serverUrl}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId })
    })
    const data = await res.json()
    if (!res.ok) {
      log(`❌ Server-Exception: ${data.detail || 'Unknown error'}`)
      return
    }

    log(`🎮 ${data.message || 'Game started!'}`)
  } catch (err) {
    console.error('❌ Failed to start game:', err)
  }

  document.getElementById('controls-start').hidden = true
  document.getElementById('songListHeader').style.display = 'block'
  document.getElementById('songTimeline').style.display = 'block'
  document.getElementById('songCount').style.display = 'block'
}

const setupDragDrop = () => {
  const timeline = document.getElementById('songTimeline')
  const newSongContainer = document.getElementById('newSongContainer')

  new Sortable(timeline, {
    group: 'songs',
    animation: 150,
    sort: true,
    draggable: '.song-entry',
    filter: ':not(#new-song)',
    preventOnFilter: true,
    onAdd: evt => {
      if (evt.item.id === 'new-song') {
        const newIndex = evt.newIndex
        // log(`📤 Guess submitted: insert at index ${newIndex}`)

        // Remove the dragged song from the timeline immediately
        evt.item.remove()

        // Send the guess to the server
        socket.send(JSON.stringify({ type: 'guess', index: newIndex }))

        // Disable dragging
        Sortable.get(timeline).option('disabled', true)
        Sortable.get(newSongContainer).option('disabled', true)
      }
    },
    onStart: () => {
      timeline.classList.add('drag-active')
    },
    onEnd: () => {
      timeline.classList.remove('drag-active')
    }
  })

  new Sortable(newSongContainer, {
    group: 'songs',
    sort: false
  })
}
