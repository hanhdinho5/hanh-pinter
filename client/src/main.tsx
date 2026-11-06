import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { syncAvatarsFromServer } from './printer3d/avatarManager'

// Đồng bộ trước khi tạo dữ liệu mẫu và dựng cảnh.
await syncAvatarsFromServer()
const { default: App } = await import('./App.tsx')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
