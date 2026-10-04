import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { parseSolarComputePreference } from './solar/computeBackend'
import './index.css'

const root = createRoot(document.getElementById('root')!)
const validationRequested = new URLSearchParams(window.location.search)
  .has('webgpu-validation')

if (validationRequested) {
  void import('./components/WebGpuValidationPage.tsx').then(
    ({ WebGpuValidationPage }) => root.render(
      <StrictMode>
        <WebGpuValidationPage />
      </StrictMode>,
    ),
  )
} else {
  void import('./App.tsx').then(({ default: App }) => root.render(
    <StrictMode>
      <App solarComputePreference={parseSolarComputePreference(
        window.location.search,
      )} />
    </StrictMode>,
  ))
}
