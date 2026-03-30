'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm'
import { Loader2 } from 'lucide-react'

interface VRMAvatarProps {
  audioElement?: HTMLAudioElement | null
  label?: string
  subtitle?: string
  modelUrl?: string
}

export default function VRMAvatar({ 
  audioElement, 
  label, 
  subtitle, 
  modelUrl = '/models/avatar.vrm' 
}: VRMAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const vrmRef = useRef<VRM | null>(null)
  const animationIdRef = useRef<number | null>(null)
  const clockRef = useRef<THREE.Clock>(new THREE.Clock())
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const initScene = useCallback(() => {
    if (!containerRef.current) return null

    const scene = new THREE.Scene()
    // transparent background
    scene.background = null

    const camera = new THREE.PerspectiveCamera(45, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 100)
    camera.position.set(0, 1.4, 2.2)
    camera.lookAt(0, 1.3, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    containerRef.current.appendChild(renderer.domElement)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2)
    directionalLight.position.set(2, 4, 3)
    directionalLight.castShadow = true
    scene.add(directionalLight)

    const fillLight = new THREE.DirectionalLight(0x88ccff, 0.4)
    fillLight.position.set(-2, 2, -1)
    scene.add(fillLight)

    return { scene, camera, renderer }
  }, [])

  useEffect(() => {
    const { scene, camera, renderer } = initScene() || {}
    if (!scene || !camera || !renderer) return

    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer

    const loader = new GLTFLoader()
    loader.register((parser: any) => new VRMLoaderPlugin(parser))

    loader.load(
      modelUrl,
      (gltf: any) => {
        const vrm = gltf.userData.vrm
        if (!vrm) {
          setError('Failed to parse VRM model')
          setIsLoading(false)
          return
        }

        vrmRef.current = vrm
        scene.add(vrm.scene)

        if (vrm.expressionManager) {
          // expressions initialized
        }

        setIsLoading(false)
      },
      (progress: any) => {
        console.log('Loading VRM:', (progress.loaded / progress.total * 100).toFixed(0) + '%')
      },
      (err: any) => {
        console.error('Error loading VRM:', err)
        setError('Failed to load model')
        setIsLoading(false)
      }
    )

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate)

      const delta = clockRef.current.getDelta()

      if (vrmRef.current) {
        vrmRef.current.update(delta)
      }

      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!containerRef.current || !renderer || !camera) return
      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      renderer.dispose()
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [initScene, modelUrl])

  useEffect(() => {
    if (!audioElement || !vrmRef.current) return

    let source: MediaElementAudioSourceNode | null = null

    const setupAudio = async () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        audioContextRef.current = new AudioContextClass()
        const ctx = audioContextRef.current

        source = ctx.createMediaElementSource(audioElement)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8

        source.connect(analyser)
        analyser.connect(ctx.destination)
        analyserRef.current = analyser
      } catch (err) {
        console.error('Error setting up audio:', err)
      }
    }

    setupAudio()

    const updateLipSync = () => {
      if (!analyserRef.current || !vrmRef.current?.expressionManager) {
        if (!audioElement?.paused) {
          requestAnimationFrame(updateLipSync)
        }
        return
      }

      const dataArray = new Uint8Array(analyserRef.current.fftSize)
      analyserRef.current.getByteTimeDomainData(dataArray)

      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        const n = (dataArray[i] - 128) / 128
        sum += n * n
      }
      const rms = Math.sqrt(sum / dataArray.length)
      const mouthOpen = Math.min(1, rms * 4)

      const expressionManager = vrmRef.current.expressionManager
      expressionManager.setValue('aa', mouthOpen)
      expressionManager.setValue('ih', mouthOpen * 0.4)
      expressionManager.setValue('ou', mouthOpen * 0.3)
      expressionManager.setValue('ee', mouthOpen * 0.2)
      expressionManager.setValue('oh', mouthOpen * 0.5)

      if (!audioElement.paused) {
        requestAnimationFrame(updateLipSync)
      }
    }

    const onPlay = () => {
      setIsSpeaking(true)
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume()
      }
      updateLipSync()
    }

    const onPause = () => {
      setIsSpeaking(false)
    }

    const onEnded = () => {
      setIsSpeaking(false)
      if (vrmRef.current?.expressionManager) {
        const expressionManager = vrmRef.current.expressionManager
        expressionManager.setValue('aa', 0)
        expressionManager.setValue('ih', 0)
        expressionManager.setValue('ou', 0)
        expressionManager.setValue('ee', 0)
        expressionManager.setValue('oh', 0)
      }
    }

    audioElement.addEventListener('play', onPlay)
    audioElement.addEventListener('pause', onPause)
    audioElement.addEventListener('ended', onEnded)

    return () => {
      audioElement.removeEventListener('play', onPlay)
      audioElement.removeEventListener('pause', onPause)
      audioElement.removeEventListener('ended', onEnded)
    }
  }, [audioElement])

  return (
    <div className="w-full h-full relative" ref={containerRef}>
      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm z-10">
          <Loader2 className="animate-spin text-[#00E5FF] h-8 w-8 mb-3" />
          <p className="text-xs text-white/70 tracking-widest uppercase">Connecting Avatar...</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm z-10">
          <div className="text-red-500 text-sm mb-2">Camera Unavailable</div>
          <p className="text-xs text-white/50">{error}</p>
        </div>
      )}
      {/* The canvas is automatically injected here by Three.js */}
    </div>
  )
}
