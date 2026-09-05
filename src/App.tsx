import { useEffect, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import './App.css'

function App() {
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport) {
      return
    }

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xdde8f0)

    // Camera
    const camera = new THREE.PerspectiveCamera(
      50,
      viewport.clientWidth / viewport.clientHeight,
      0.1,
      1000,
    )

    camera.position.set(20, 20, 20)

    // Renderer
    const renderer = new THREE.WebGPURenderer({
      antialias: true,
    })

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(viewport.clientWidth, viewport.clientHeight)

    viewport.appendChild(renderer.domElement)

    // Camera controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableDamping = true

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(30, 30)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x7fa36b,
    })

    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)

    // Temporary "house"
    const houseGeometry = new THREE.BoxGeometry(6, 3, 8)
    const houseMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8afa2,
    })

    const house = new THREE.Mesh(houseGeometry, houseMaterial)
    house.position.set(-4, 1.5, 0)
    scene.add(house)

    // Reference grid
    const grid = new THREE.GridHelper(30, 30)
    scene.add(grid)

    // Lighting
    const skyLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2)
    scene.add(skyLight)

    const sunLight = new THREE.DirectionalLight(0xffffff, 3)
    sunLight.position.set(10, 15, 5)
    scene.add(sunLight)

    // Resize handling
    const handleResize = () => {
      camera.aspect = viewport.clientWidth / viewport.clientHeight
      camera.updateProjectionMatrix()

      renderer.setSize(
        viewport.clientWidth,
        viewport.clientHeight,
      )
    }

    window.addEventListener('resize', handleResize)

    // Render loop
    renderer.setAnimationLoop(() => {
      controls.update()
      renderer.render(scene, camera)
    })

    // React cleanup
    return () => {
      window.removeEventListener('resize', handleResize)

      renderer.setAnimationLoop(null)
      controls.dispose()

      groundGeometry.dispose()
      groundMaterial.dispose()
      houseGeometry.dispose()
      houseMaterial.dispose()
      renderer.dispose()

      renderer.domElement.remove()
    }
  }, [])

  return <div ref={viewportRef} className="viewport" />
}

export default App