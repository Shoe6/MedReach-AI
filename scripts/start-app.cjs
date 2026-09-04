const net = require('node:net')
const { spawn } = require('node:child_process')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const commandShell = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : null
const services = [
  {
    name: 'Firebase emulators',
    port: 4000,
    command: commandShell || 'firebase',
    args: commandShell ? ['/d', '/s', '/c', 'firebase emulators:start'] : ['emulators:start'],
  },
  {
    name: 'FastAPI',
    port: 8000,
    command: path.join(root, 'backend-dev', 'venv', 'Scripts', 'python.exe'),
    args: ['-m', 'uvicorn', 'main:app', '--port', '8000'],
  },
  {
    name: 'Vite frontend',
    port: 5173,
    command: commandShell || 'npm',
    args: commandShell
      ? ['/d', '/s', '/c', 'npm run dev -- --port 5173']
      : ['run', 'dev', '--', '--port', '5173'],
  },
]

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

async function startService(service) {
  if (await isPortOpen(service.port)) {
    console.log(`${service.name} already running on port ${service.port}; reusing it.`)
    return null
  }

  const child = spawn(service.command, service.args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  })
  child.on('error', (error) => {
    console.error(`Unable to start ${service.name}: ${error.message}`)
  })
  console.log(`Started ${service.name} on port ${service.port}.`)
  return child
}

async function main() {
  const children = (await Promise.all(services.map(startService))).filter(Boolean)

  if (children.length === 0) {
    console.log('All services are already running.')
    return
  }

  const stopChildren = () => {
    for (const child of children) {
      if (!child.killed) child.kill()
    }
  }
  process.once('SIGINT', stopChildren)
  process.once('SIGTERM', stopChildren)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
