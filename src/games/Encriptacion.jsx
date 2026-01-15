import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Encriptación.jsx
 * Adaptación del juego “Encriptación” a React (formato .jsx), siguiendo la misma estructura
 * de “CalculoMental.jsx”:
 *   1) Wizard de Configuración: RA -> Juego
 *   2) Panel izquierdo (config) + panel derecho (vista previa / juego)
 *   3) Modales RA sin cámara con SweetAlert2 + (opcional) Three.js para contenido 3D
 */

// =======================
// 1) CONFIGURACIÓN (LS)
// =======================
const STORAGE_NS = "ar:encriptacion";
const LS = {
  arStages: `${STORAGE_NS}:selectedStages`,
  arConfig: `${STORAGE_NS}:config`,
  gameConfig: `${STORAGE_NS}:game_config`,
};

const AR_STAGES = ["Inicio", "Acierto", "Final"];
const AR_TYPES = ["Texto", "Imagen", "Audio", "Video"];

const readJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin acción: si localStorage falla, el juego sigue funcionando en memoria.
  }
};

// =======================
// 2) UTILIDADES DE JUEGO
// =======================

// Alfabeto español (incluye Ñ), igual que en tu script.js
const ALPHABET_ES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "Ñ",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

/**
 * encrypt(text)
 * Convierte cada letra a su índice en ALPHABET_ES con 2 dígitos (00-26).
 * - Espacio: devuelve doble espacio, para separar palabras.
 * - Carácter fuera de alfabeto: se conserva.
 */
function encrypt(text) {
  return String(text)
    .split("")
    .map((char) => {
      const upperChar = char.toUpperCase();
      if (upperChar === " ") return "  ";
      const idx = ALPHABET_ES.indexOf(upperChar);
      if (idx === -1) return char;
      return String(idx).padStart(2, "0");
    })
    .join(" ");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// =======================
// 3) SWEETALERT / TOAST
// =======================

function ensureSwal() {
  if (!window.Swal) {
    // No usar alert, simplemente retornar false
    console.warn("SweetAlert2 aún no ha cargado.");
    return false;
  }
  return true;
}

function toast(message, type = "info") {
  if (!ensureSwal()) return;

  window.Swal.fire({
    toast: true,
    position: "top-end",
    icon: type,
    title: message,
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
  });
}

// =======================
// 4) THREE.JS (CARGA LAZY)
// =======================

// Cargadores (referencias) para evitar múltiples descargas
const useThreeLoaders = () => {
  const threeLoadRef = useRef(null);
  const threeAddonsRef = useRef(null);

  const ensureThree = () => {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (threeLoadRef.current) return threeLoadRef.current;

    // Preferimos ESM (estable en Vite)
    threeLoadRef.current = import("https://esm.sh/three@0.160.1")
      .then((mod) => {
        const THREE = { ...mod };
        window.THREE = THREE;
        return THREE;
      })
      .catch(() => {
        // Fallback legacy
        return new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";
          script.async = true;
          script.onload = () => resolve(window.THREE);
          script.onerror = () => reject(new Error("No se pudo cargar ThreeJS."));
          document.body.appendChild(script);
        });
      });

    return threeLoadRef.current;
  };

  const ensureThreeTextAddons = () => {
    if (threeAddonsRef.current) return threeAddonsRef.current;

    threeAddonsRef.current = ensureThree().then(async (THREE) => {
      const [{ FontLoader }, { TextGeometry }] = await Promise.all([
        import("https://esm.sh/three@0.160.1/addons/loaders/FontLoader.js"),
        import("https://esm.sh/three@0.160.1/addons/geometries/TextGeometry.js"),
      ]);

      return { THREE, FontLoader, TextGeometry };
    });

    return threeAddonsRef.current;
  };

  return { ensureThree, ensureThreeTextAddons };
};

// =======================
// 5) FONDO DECORADO + SÍMBOLOS FLOTANTES
// =======================

const ENCRYPT_SYMBOLS = ["🔐", "🗝️", "01", "10", "Ñ", "Z", "🧩", "🧠"];

function createFloatingSymbols(container) {
  if (!container) return () => {};

  const uid = `enc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const nodes = [];
  const styles = [];

  ENCRYPT_SYMBOLS.forEach((symbol, index) => {
    const el = document.createElement("div");
    el.textContent = symbol;

    const size = Math.random() * 26 + 18; // 18–44px
    const duration = Math.random() * 5 + 5; // 5–10s
    const left = Math.random() * 80 + 10;
    const top = Math.random() * 80 + 10;
    const dx = Math.random() * 30 - 15;
    const dy = Math.random() * 30 - 15;
    const rot = Math.random() * 30 - 15;

    const animName = `encFloat_${uid}_${index}`;

    el.style.cssText = `
      position: absolute;
      color: rgba(255,255,255,0.22);
      font-size: ${size}px;
      animation: ${animName} ${duration}s ease-in-out infinite;
      left: ${left}%;
      top: ${top}%;
      user-select: none;
      pointer-events: none;
    `;

    const kf = document.createElement("style");
    kf.textContent = `
      @keyframes ${animName} {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(${dx}px, ${dy}px) rotate(${rot}deg); }
      }
    `;

    document.head.appendChild(kf);
    container.appendChild(el);

    styles.push(kf);
    nodes.push(el);
  });

  return () => {
    nodes.forEach((n) => n.remove());
    styles.forEach((s) => s.remove());
  };
}

// Función para iniciar la cámara en el fondo
async function startCamera(videoElementId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    const videoElement = document.getElementById(videoElementId);
    if (videoElement) {
      videoElement.srcObject = stream;
      videoElement.play();
    }
    return stream;
  } catch (error) {
    console.error('Error al acceder a la cámara:', error);
    return null;
  }
}

// Función para detener la cámara
function stopCamera(stream) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
}

function buildDecoratedHtml({ bgId, topHtml = "", innerHtml = "", useCamera = false, videoId = "" }) {
  return `
    <div class="enc-ar-bg ${useCamera ? 'enc-ar-bg-camera' : ''}">
      ${useCamera ? `<video id="${videoId}" class="enc-ar-camera-bg" autoplay playsinline muted></video>` : ''}
      <div id="${bgId}" class="enc-ar-bg-elements"></div>
      <div class="enc-ar-content">${topHtml}${innerHtml}</div>
    </div>
  `;
}

// =======================
// 6) RENDER 3D POR ETAPA (MINIMAL)
// =======================

/**
 * initThreeStage(container, stageCfg)
 * Renderiza un “panel 3D” para Texto3D/Imagen/Audio/Video.
 * - Texto normal se renderiza como HTML (sin Three).
 *
 * Importante: este render 3D es deliberadamente “minimal” para mantener el archivo manejable.
 * Si quieres, podemos migrar el initThreeStage completo desde CalculoMental.jsx.
 */
function initThreeStageFactory({ ensureThree, ensureThreeTextAddons }) {
  return function initThreeStage(container, stageCfg) {
    if (!container) return () => {};

    let disposed = false;
    let rafId = 0;

    let renderer;
    let scene;
    let camera;

    let videoEl;
    let videoTexture;
    let audioInstance = null;
    let resizeObserver = null;
    let toggleClickHandler = null;
    let videoMetadataHandler = null;
    let portalGroup = null;
    let portalGlow = null;
    let portalFrameGroup = null;
    let portalParticles = null;
    let portalParticleMeta = null;

    const cleanup = () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);

      try {
        if (videoEl) {
          if (videoMetadataHandler) {
            videoEl.removeEventListener("loadedmetadata", videoMetadataHandler);
          }
          videoEl.pause();
          videoEl.src = "";
          videoEl.load();
        }
      } catch {}

      try {
        if (audioInstance) {
          if (audioInstance.isPlaying) audioInstance.stop();
          audioInstance.disconnect();
        }
      } catch {}

      try {
        if (toggleClickHandler && container) {
          container.removeEventListener("click", toggleClickHandler);
        }
      } catch {}

      try {
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
      } catch {}

      try {
        if (renderer) {
          renderer.dispose?.();
          renderer.domElement?.remove();
        }
      } catch {}

      // Limpieza extra de Three (si existe)
      try {
        if (scene) {
          scene.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose?.();
            if (obj.material) {
              if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
              else obj.material.dispose?.();
            }
          });
        }
      } catch {}
    };

    (async () => {
      const THREE = await ensureThree();

      const w = Math.max(260, container.clientWidth);
      const h = Math.max(220, container.clientHeight);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
      camera.position.set(0, 0, 6);

      // Iluminación básica
      const ambient = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambient);
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(3, 5, 4);
      scene.add(dir);

      // Fondo "glow" (simple)
      const bgGeo = new THREE.SphereGeometry(18, 32, 32);
      const bgMat = new THREE.MeshBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.12, side: THREE.BackSide });
      const bg = new THREE.Mesh(bgGeo, bgMat);
      scene.add(bg);

      // Funciones helper para Video
      const createGlowTexture = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        canvas.width = 256;
        canvas.height = 256;
        const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
        grad.addColorStop(0, "rgba(0, 255, 255, 0.45)");
        grad.addColorStop(0.45, "rgba(0, 200, 255, 0.2)");
        grad.addColorStop(1, "rgba(0, 140, 255, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      };

      const portalFrameMaterial = new THREE.MeshStandardMaterial({
        color: 0x83f3ff,
        emissive: 0x40e0ff,
        emissiveIntensity: 0.85,
        roughness: 0.2,
        metalness: 0.2,
        transparent: true,
        opacity: 0.95,
      });

      const updatePortalFrame = (frameWidth, frameHeight) => {
        if (!portalFrameGroup) return;

        portalFrameGroup.children.forEach((child) => {
          if (child.geometry) child.geometry.dispose();
        });
        portalFrameGroup.clear();

        const thickness = 0.09;
        const depth = 0.18;
        const halfW = frameWidth / 2;
        const halfH = frameHeight / 2;

        const top = new THREE.Mesh(
          new THREE.BoxGeometry(frameWidth + thickness * 2, thickness, depth),
          portalFrameMaterial
        );
        top.position.set(0, halfH + thickness / 2, 0);
        portalFrameGroup.add(top);

        const bottom = new THREE.Mesh(
          new THREE.BoxGeometry(frameWidth + thickness * 2, thickness, depth),
          portalFrameMaterial
        );
        bottom.position.set(0, -halfH - thickness / 2, 0);
        portalFrameGroup.add(bottom);

        const left = new THREE.Mesh(
          new THREE.BoxGeometry(thickness, frameHeight, depth),
          portalFrameMaterial
        );
        left.position.set(-halfW - thickness / 2, 0, 0);
        portalFrameGroup.add(left);

        const right = new THREE.Mesh(
          new THREE.BoxGeometry(thickness, frameHeight, depth),
          portalFrameMaterial
        );
        right.position.set(halfW + thickness / 2, 0, 0);
        portalFrameGroup.add(right);

        if (portalParticles && portalParticleMeta) {
          const posAttr = portalParticles.geometry.getAttribute("position");
          const positions = posAttr.array;
          const baseRadius = Math.hypot(halfW, halfH) * 1.08;
          const depthScale = Math.min(0.5, baseRadius * 0.2);
          for (let i = 0; i < portalParticleMeta.length; i += 1) {
            const meta = portalParticleMeta[i];
            const radius = baseRadius * meta.radius;
            positions[i * 3] = Math.cos(meta.angle) * radius;
            positions[i * 3 + 1] = Math.sin(meta.angle) * radius;
            positions[i * 3 + 2] = meta.depth * depthScale;
          }
          posAttr.needsUpdate = true;
          if (portalParticles.material) {
            portalParticles.material.size = Math.max(0.04, baseRadius * 0.03);
          }
        }
      };

      // Contenido por tipo
      if (stageCfg.type === "Texto") {
        const { FontLoader, TextGeometry } = await ensureThreeTextAddons();

        const loader = new FontLoader();
        // Fuente helvetiker en CDN (compatible con TextGeometry)
        const font = await new Promise((resolve, reject) => {
          loader.load(
            "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json",
            resolve,
            undefined,
            reject
          );
        });

        const text = (stageCfg.text || "").trim().slice(0, 20) || "Encriptación";
        const geo = new TextGeometry(text, {
          font,
          size: 0.7,
          height: 0.18,
          curveSegments: 10,
          bevelEnabled: true,
          bevelThickness: 0.03,
          bevelSize: 0.02,
          bevelSegments: 4,
        });
        geo.computeBoundingBox();
        geo.center();

        const mat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.1,
          metalness: 0.0,
          emissive: 0xffffff,
          emissiveIntensity: 0.2,
        });
        const mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);

        const animate = () => {
          if (disposed) return;
          mesh.rotation.y += 0.01;
          renderer.render(scene, camera);
          rafId = requestAnimationFrame(animate);
        };
        animate();
      }

      if (stageCfg.type === "Imagen") {
        // Crear el root group que rotará
        const root = new THREE.Group();
        scene.add(root);

        // Crear el plano frontal
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })
        );
        root.add(plane);

        // Crear el plano trasero (para ver la imagen por ambos lados)
        const planeBack = new THREE.Mesh(
          plane.geometry.clone(),
          plane.material.clone()
        );
        planeBack.rotation.y = Math.PI;
        planeBack.visible = false;
        root.add(planeBack);

        // Función para ajustar el tamaño del plano según el aspect ratio
        const fitPlaneToAspect = (aspect, baseSize = 4.8) => {
          if (!aspect) return;
          if (aspect >= 1) {
            const width = baseSize;
            const height = baseSize / aspect;
            plane.scale.set(width, height, 1);
            planeBack.scale.set(width, height, 1);
          } else {
            const width = baseSize * aspect;
            const height = baseSize;
            plane.scale.set(width, height, 1);
            planeBack.scale.set(width, height, 1);
          }
        };

        // Cargar la textura
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load(
          stageCfg.imageUrl || "",
          (texture) => {
            if (disposed) return;
            texture.colorSpace = THREE.SRGBColorSpace;
            plane.material.map = texture;
            plane.material.needsUpdate = true;

            // Textura para el lado trasero (invertida)
            const backTexture = texture.clone();
            backTexture.colorSpace = THREE.SRGBColorSpace;
            backTexture.wrapS = THREE.RepeatWrapping;
            backTexture.repeat.x = -1;
            backTexture.offset.x = 1;
            backTexture.needsUpdate = true;
            planeBack.material.map = backTexture;
            planeBack.material.needsUpdate = true;
            planeBack.visible = true;

            // Ajustar tamaño al aspect ratio de la imagen
            fitPlaneToAspect(texture.image.width / texture.image.height);
          },
          undefined,
          () => {
            if (!disposed && container) {
              container.textContent = "No se pudo cargar la imagen.";
            }
          }
        );

        // Animación de rotación completa
        const animate = () => {
          if (disposed) return;
          root.rotation.y += 0.01; // Rotación continua de 360 grados
          renderer.render(scene, camera);
          rafId = requestAnimationFrame(animate);
        };
        animate();
      }

      if (stageCfg.type === "Video") {
        videoEl = document.createElement("video");
        videoEl.src = stageCfg.videoUrl || "";
        videoEl.crossOrigin = "anonymous";
        videoEl.loop = true;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.preload = "auto";

        videoTexture = new THREE.VideoTexture(videoEl);
        videoTexture.colorSpace = THREE.SRGBColorSpace;

        // Crear el grupo portal
        portalGroup = new THREE.Group();
        scene.add(portalGroup);

        // Crear el plano del video
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            map: videoTexture,
            transparent: true,
            opacity: 0.96,
          })
        );
        plane.position.z = -0.06;
        portalGroup.add(plane);

        // Crear el glow
        const glowTexture = createGlowTexture();
        if (glowTexture) {
          const glowMaterial = new THREE.MeshBasicMaterial({
            map: glowTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          portalGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMaterial);
          portalGlow.position.z = -0.14;
          portalGroup.add(portalGlow);
        }

        // Crear el marco
        portalFrameGroup = new THREE.Group();
        portalGroup.add(portalFrameGroup);

        // Crear partículas
        const particleCount = 160;
        const positions = new Float32Array(particleCount * 3);
        portalParticleMeta = [];
        for (let i = 0; i < particleCount; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 0.85 + Math.random() * 0.35;
          const depth = (Math.random() - 0.5);
          portalParticleMeta.push({ angle, radius, depth });
          positions[i * 3] = Math.cos(angle) * radius;
          positions[i * 3 + 1] = Math.sin(angle) * radius;
          positions[i * 3 + 2] = depth * 0.4;
        }
        const particleGeo = new THREE.BufferGeometry();
        particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const particleMat = new THREE.PointsMaterial({
          color: 0x7df9ff,
          size: 0.05,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        portalParticles = new THREE.Points(particleGeo, particleMat);
        portalGroup.add(portalParticles);

        // Función para ajustar el tamaño del plano según el aspect ratio
        const fitPlaneToAspect = (aspect, baseSize = 8) => {
          if (!aspect) return;
          if (aspect >= 1) {
            const width = baseSize;
            const height = baseSize / aspect;
            plane.scale.set(width, height, 1);
            if (portalGlow) portalGlow.scale.set(width * 1.3, height * 1.3, 1);
            updatePortalFrame(width, height);
          } else {
            const width = baseSize * aspect;
            const height = baseSize;
            plane.scale.set(width, height, 1);
            if (portalGlow) portalGlow.scale.set(width * 1.3, height * 1.3, 1);
            updatePortalFrame(width, height);
          }
        };

        // Ajustar tamaño inicial (16:9 por defecto)
        fitPlaneToAspect(16 / 9);

        // Listener para ajustar cuando se cargue el video
        videoMetadataHandler = () => {
          if (videoEl.videoWidth && videoEl.videoHeight) {
            fitPlaneToAspect(videoEl.videoWidth / videoEl.videoHeight);
          }
        };
        videoEl.addEventListener("loadedmetadata", videoMetadataHandler);

        // Iniciar reproducción
        videoEl.play().catch(() => {});

        // Handler para pausar/reproducir al hacer click
        toggleClickHandler = () => {
          if (videoEl.paused) {
            videoEl.muted = false;
            videoEl.play().catch(() => {});
          } else {
            videoEl.pause();
          }
        };
        container.addEventListener("click", toggleClickHandler);

        // Animación
        const animate = () => {
          if (disposed) return;

          // Animación flotante del portal
          const now = performance.now();
          const floatY = Math.sin(now * 0.0011) * 0.06;
          const floatX = Math.cos(now * 0.0009) * 0.02;
          portalGroup.position.y = floatY;
          portalGroup.position.x = floatX;
          portalGroup.rotation.z = Math.sin(now * 0.0006) * 0.04;
          portalGroup.rotation.y = Math.cos(now * 0.0005) * 0.04;

          // Rotación de partículas
          if (portalParticles) {
            portalParticles.rotation.z += 0.002;
            portalParticles.rotation.y += 0.001;
          }

          renderer.render(scene, camera);
          rafId = requestAnimationFrame(animate);
        };
        animate();
      }

      if (stageCfg.type === "Audio") {
        // Crear la nota musical 3D (igual que en CalculoMental.jsx)
        const noteMaterial = new THREE.MeshStandardMaterial({
          color: 0xffd166,
          emissive: 0xffb703,
          emissiveIntensity: 0.5,
          roughness: 0.2,
          metalness: 0.1,
        });

        const noteGroup = new THREE.Group();

        // Cabeza de la nota (esfera)
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 24, 24),
          noteMaterial
        );
        head.position.set(-0.15, -0.1, 0);
        noteGroup.add(head);

        // Tallo de la nota (cilindro)
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.8, 12),
          noteMaterial
        );
        stem.position.set(0.1, 0.35, 0);
        noteGroup.add(stem);

        // Bandera de la nota
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.12, 0.08),
          noteMaterial
        );
        flag.position.set(0.35, 0.68, 0);
        flag.rotation.z = -0.35;
        noteGroup.add(flag);

        noteGroup.scale.set(2, 2, 2);

        scene.add(noteGroup);

        // Configurar audio con THREE.Audio
        const listener = new THREE.AudioListener();
        camera.add(listener);
        audioInstance = new THREE.Audio(listener);
        const loader = new THREE.AudioLoader();
        loader.setCrossOrigin("anonymous");

        let audioAnalyser = null;
        let notePulse = 0;

        loader.load(
          stageCfg.audioUrl || "",
          (buffer) => {
            if (disposed) return;
            audioInstance.setBuffer(buffer);
            audioInstance.setLoop(true);
            audioInstance.setVolume(0.6);
            audioAnalyser = new THREE.AudioAnalyser(audioInstance, 128);
            audioInstance.play().catch(() => {});
          },
          undefined,
          () => {
            if (!disposed && container) {
              container.textContent = "No se pudo cargar el audio.";
            }
          }
        );

        // Handler para pausar/reproducir al hacer click
        toggleClickHandler = () => {
          if (!audioInstance.buffer) return;
          if (audioInstance.isPlaying) audioInstance.pause();
          else audioInstance.play().catch(() => {});
        };
        container.addEventListener("click", toggleClickHandler);

        const animate = () => {
          if (disposed) return;

          // Animar la nota musical según el audio
          if (noteGroup && audioAnalyser) {
            const raw = audioAnalyser.getAverageFrequency() / 255;
            notePulse += (raw - notePulse) * 0.15;
            const scale = 1 + notePulse * 0.5;
            noteGroup.scale.setScalar(scale * 2); // Multiplicar por 2 para mantener el tamaño base
            noteGroup.position.y = notePulse * 0.35;
          }

          renderer.render(scene, camera);
          rafId = requestAnimationFrame(animate);
        };
        animate();
      }

      // Resize reactivo
      resizeObserver = new ResizeObserver(() => {
        if (!renderer || !camera || disposed) return;
        const nw = Math.max(260, container.clientWidth);
        const nh = Math.max(220, container.clientHeight);
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
      });
      resizeObserver.observe(container);
    })().catch(() => {
      // Si falla Three, no rompemos el modal.
    });

    return cleanup;
  };
}

// =======================
// 7) COMPONENTE
// =======================

export default function Encriptacion() {
  // 7.1) Loaders (Three)
  const { ensureThree, ensureThreeTextAddons } = useThreeLoaders();
  const initThreeStage = useMemo(
    () => initThreeStageFactory({ ensureThree, ensureThreeTextAddons }),
    [ensureThree, ensureThreeTextAddons]
  );

  // 7.2) Estado del wizard
  const [setupStep, setSetupStep] = useState("ar");

  // 7.3) Estado RA
  const [arSelectedStages, setArSelectedStages] = useState(() =>
    readJSON(LS.arStages, { Inicio: false, Acierto: false, Final: false })
  );

  const [arConfig, setArConfig] = useState(() =>
    readJSON(LS.arConfig, {
      Inicio: { type: "Texto", text: "" },
      Acierto: { type: "Texto", text: "" },
      Final: { type: "Texto", text: "" },
    })
  );

  // Nota: los ObjectURL no sobreviven a un refresh. Si necesitas persistencia real,
  // conviene base64 o subir a servidor.
  const mediaObjectUrlsRef = useRef({});
  useEffect(() => {
    return () => {
      Object.values(mediaObjectUrlsRef.current).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      mediaObjectUrlsRef.current = {};
    };
  }, []);

  // Persistencia ligera (a medida que editas)
  useEffect(() => {
    writeJSON(LS.arStages, arSelectedStages);
  }, [arSelectedStages]);

  useEffect(() => {
    writeJSON(LS.arConfig, arConfig);
  }, [arConfig]);

  // 7.4) Estado de configuración del juego
  const [gameConfig, setGameConfig] = useState(() =>
    readJSON(LS.gameConfig, { level: "basico", exerciseCount: 1 })
  );

  useEffect(() => {
    writeJSON(LS.gameConfig, gameConfig);
  }, [gameConfig]);

  // 7.5) Cargar SweetAlert2 dinámicamente
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/sweetalert2@11";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // 7.6) Banco de ejercicios
  const [exerciseBank, setExerciseBank] = useState({ basico: [], intermedio: [], avanzado: [] });

  useEffect(() => {
    // Nota: se espera ejercicios.json en /public
    fetch("/encrip/ejercicios.json")
      .then((r) => r.json())
      .then((data) => {
        setExerciseBank({
          basico: data?.basico ?? [],
          intermedio: data?.intermedio ?? [],
          avanzado: data?.avanzado ?? [],
        });
      })
      .catch(() => {
        toast("No se pudo cargar ejercicios.json", "error");
      });
  }, []);

  const availableCount = useMemo(() => {
    return (exerciseBank?.[gameConfig.level] ?? []).length;
  }, [exerciseBank, gameConfig.level]);

  // Ajusta exerciseCount si el nivel cambia
  useEffect(() => {
    if (availableCount === 0) return;
    if (gameConfig.exerciseCount > availableCount) {
      setGameConfig((prev) => ({ ...prev, exerciseCount: availableCount }));
    }
    if (gameConfig.exerciseCount < 1) {
      setGameConfig((prev) => ({ ...prev, exerciseCount: 1 }));
    }
  }, [availableCount]);

  // 7.7) Estado del juego
  const [gameState, setGameState] = useState("config"); // config | welcome | playing
  const [pickedExercises, setPickedExercises] = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [encryptedText, setEncryptedText] = useState("");
  const [answer, setAnswer] = useState("");

  // =======================
  // 8) HANDLERS RA
  // =======================

  const toggleARStage = (stage) => {
    setArSelectedStages((prev) => ({ ...prev, [stage]: !prev[stage] }));
  };

  const setARStageType = (stage, type) => {
    setArConfig((prev) => ({
      ...prev,
      [stage]: { ...(prev[stage] ?? {}), type },
    }));
  };

  const setARStageField = (stage, field, value) => {
    setArConfig((prev) => ({
      ...prev,
      [stage]: { ...(prev[stage] ?? {}), [field]: value },
    }));
  };

  const handleARStageFileChange = (stage, field, file) => {
    const key = `${stage}:${field}`;
    const prevUrl = mediaObjectUrlsRef.current[key];
    if (prevUrl) {
      try {
        URL.revokeObjectURL(prevUrl);
      } catch {}
      delete mediaObjectUrlsRef.current[key];
    }

    if (!file) {
      setARStageField(stage, field, "");
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    mediaObjectUrlsRef.current[key] = nextUrl;
    setARStageField(stage, field, nextUrl);
  };

  const validateARConfig = () => {
    const enabledStages = AR_STAGES.filter((s) => arSelectedStages[s]);
    if (enabledStages.length === 0) {
      return { ok: false, msg: "Selecciona al menos una etapa de RA (Inicio/Acierto/Final)." };
    }

    for (const stage of enabledStages) {
      const cfg = arConfig?.[stage] ?? {};
      if (!cfg.type) return { ok: false, msg: `Selecciona un tipo para la etapa “${stage}”.` };

      if (cfg.type === "Texto" && !cfg.text?.trim()) {
        return { ok: false, msg: `Escribe un texto para la etapa “${stage}”.` };
      }
      if (cfg.type === "Imagen" && !cfg.imageUrl?.trim()) {
        return { ok: false, msg: `Selecciona una imagen para la etapa “${stage}”.` };
      }
      if (cfg.type === "Audio" && !cfg.audioUrl?.trim()) {
        return { ok: false, msg: `Selecciona un audio para la etapa “${stage}”.` };
      }
      if (cfg.type === "Video" && !cfg.videoUrl?.trim()) {
        return { ok: false, msg: `Selecciona un video para la etapa “${stage}”.` };
      }
    }

    return { ok: true };
  };

  const showStageModal = async (stage, swalOverrides = {}) => {
    // 1) Solo si la etapa está seleccionada
    if (!arSelectedStages?.[stage]) return true;

    // 2) Solo si hay contenido real
    const stageCfg = arConfig?.[stage] ?? {};
    const hasContent = (() => {
      if (stageCfg.type === "Texto") return !!stageCfg.text?.trim();
      if (stageCfg.type === "Imagen") return !!stageCfg.imageUrl?.trim();
      if (stageCfg.type === "Audio") return !!stageCfg.audioUrl?.trim();
      if (stageCfg.type === "Video") return !!stageCfg.videoUrl?.trim();
      return false;
    })();
    if (!hasContent) return true;
    if (!ensureSwal()) return false;

    const containerId = `ra-three-${stage}-${Date.now()}`;
    const bgId = `enc-ar-bg-${stage}-${Date.now()}`;
    const videoId = `enc-ar-video-${stage}-${Date.now()}`;
    const useCamera = stage === 'Acierto';

    let cleanupThree;
    let cleanupSymbols;
    let cameraStream;

    const html = buildDecoratedHtml({
      bgId,
      innerHtml: `<div class="enc-ar-three-wrap"><div id="${containerId}" class="ra-three-canvas"></div></div>`,
      useCamera,
      videoId,
    });

    // 3) Modal tipo script.js (overlay)
    const res = await window.Swal?.fire({
      html,
      confirmButtonText: "Continuar",
      confirmButtonColor: '#0077b6',
      didOpen: async () => {
        if (useCamera) {
          cameraStream = await startCamera(videoId);
        }

        const bgEl = document.getElementById(bgId);
        cleanupSymbols = createFloatingSymbols(bgEl);

        const container = document.getElementById(containerId);
        if (container) cleanupThree = initThreeStage(container, stageCfg);
      },
      willClose: () => {
        if (cleanupThree) cleanupThree();
        if (cleanupSymbols) cleanupSymbols();
        if (cameraStream) stopCamera(cameraStream);
      },
      ...swalOverrides,
    });

    return !!res?.isConfirmed;
  };

  const escapeHtml = (s = "") =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const buildARStageSummaryHtml = (stage, stageCfg, isEnabled) => {
    const statusText = isEnabled ? "Habilitada" : "Deshabilitada";
    let body = `<p class="ra-empty">No habilitada.</p>`;

    if (isEnabled) {
      const type = stageCfg?.type;
      if (!type) {
        body = `<p class="ra-empty">Sin tipo configurado.</p>`;
      } else if (type === "Texto") {
        const text = stageCfg.text?.trim();
        body = text
          ? `<p class="ra-text">${escapeHtml(text)}</p>`
          : `<p class="ra-empty">Texto vacío.</p>`;
      } else if (type === "Imagen") {
        const src = stageCfg.imageUrl?.trim();
        body = src
          ? `<img class="ra-media" src="${escapeHtml(src)}" alt="RA ${escapeHtml(stage)}" />`
          : `<p class="ra-empty">Sin imagen.</p>`;
      } else if (type === "Audio") {
        const src = stageCfg.audioUrl?.trim();
        body = src
          ? `<audio class="ra-audio" controls src="${escapeHtml(src)}"></audio>`
          : `<p class="ra-empty">Sin audio.</p>`;
      } else if (type === "Video") {
        const src = stageCfg.videoUrl?.trim();
        body = src
          ? `<video class="ra-video" controls src="${escapeHtml(src)}"></video>`
          : `<p class="ra-empty">Sin video.</p>`;
      } else {
        body = `<p class="ra-empty">Tipo no soportado.</p>`;
      }
    }

    return `
      <div class="ra-card ${isEnabled ? "is-on" : "is-off"}">
        <div class="ra-card-head">
          <span class="ra-title">${escapeHtml(stage)}</span>
          <span class="ra-status">${statusText}</span>
        </div>
        <div class="ra-card-body">${body}</div>
      </div>
    `;
  };

  const buildARConfigSummaryHtml = () => {
    const cards = AR_STAGES.map((stage) => {
      const enabled = !!arSelectedStages?.[stage];
      const cfg = arConfig?.[stage] ?? {};
      return buildARStageSummaryHtml(stage, cfg, enabled);
    }).join("");

    return `
      <style>
        .ra-summary { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); text-align: left; }
        .ra-card { border: 1px solid rgba(2, 62, 138, 0.18); border-radius: 14px; padding: 14px; background: #ffffff; }
        .ra-card.is-off { opacity: 0.7; }
        .ra-card-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; }
        .ra-title { font-weight: 700; color: #023e8a; }
        .ra-status { font-size: 0.8rem; color: #0077b6; background: rgba(0,119,182,0.12); padding: 2px 8px; border-radius: 999px; }
        .ra-card.is-off .ra-status { color: #023e8a; background: rgba(2,62,138,0.08); }
        .ra-card-body { color: #023e8a; font-size: 0.9rem; }
        .ra-text { margin: 0; white-space: pre-wrap; }
        .ra-empty { margin: 0; color: rgba(2, 62, 138, 0.6); }
        .ra-media, .ra-video { width: 100%; border-radius: 10px; display: block; }
        .ra-audio { width: 100%; }
      </style>
      <div class="ra-summary">${cards}</div>
    `;
  };

  const showARConfigSummaryModal = async () => {
    if (!ensureSwal()) return true;

    const html = buildARConfigSummaryHtml();
    const res = await window.Swal.fire({
      title: "Configuración RA",
      html,
      width: 900,
      confirmButtonText: "Continuar",
      showCancelButton: true,
      cancelButtonText: "Editar",
      confirmButtonColor: '#0077b6',
    });

    return !!res?.isConfirmed;
  };

  const saveARConfigAndContinue = async () => {
    const v = validateARConfig();
    if (!v.ok) {
      toast(v.msg, "error");
      return;
    }

    writeJSON(LS.arStages, arSelectedStages);
    writeJSON(LS.arConfig, arConfig);

    const shouldContinue = await showARConfigSummaryModal();
    if (shouldContinue) {
      setSetupStep("game");
    }
  };

  // =======================
  // 9) HANDLERS JUEGO
  // =======================

  const prepareRun = () => {
    const pool = exerciseBank?.[gameConfig.level] ?? [];
    if (pool.length === 0) {
      toast("No hay ejercicios disponibles para este nivel", "error");
      return;
    }

    const count = Math.max(1, Math.min(Number(gameConfig.exerciseCount) || 1, pool.length));
    const selection = shuffle(pool).slice(0, count);

    setPickedExercises(selection);
    setStepIndex(0);
    setScore(0);
    setEncryptedText("");
    setAnswer("");
    setGameState("welcome");
  };

  const loadCurrentChallenge = (idx) => {
    const ex = pickedExercises[idx];
    if (!ex) return;

    setEncryptedText(encrypt(ex.frase));
    setAnswer("");
    setGameState("playing");
  };

  const handleStartGame = async () => {
    // Muestra RA Inicio antes de comenzar (si existe)
    const ok = await showStageModal('Inicio', {
      confirmButtonText: 'Comenzar',
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0077b6',
    });
    if (!ok) return; // si cancela, no inicia

    loadCurrentChallenge(0);
  };

  const handleVerify = async () => {
    const ex = pickedExercises[stepIndex];
    if (!ex) return;

    const ok = answer.trim().toUpperCase() === String(ex.frase).trim().toUpperCase();

    const isLastQuestion = stepIndex === pickedExercises.length - 1;

    if (ok) {
      setScore((s) => s + 10);

      if (!ensureSwal()) return;

      const result = await showStageModal('Acierto', {
        title: 'Correcto!',
        icon: 'success',
        showCancelButton: true,
        confirmButtonText: isLastQuestion ? 'Ver Resultado' : 'Siguiente ejercicio',
        cancelButtonText: 'Finalizar juego',
        confirmButtonColor: '#0077b6',
      });

      if (result) {
        const next = stepIndex + 1;
        if (next < pickedExercises.length) {
          setStepIndex(next);
          loadCurrentChallenge(next);
        } else {
          // Mostrar modal final
          await showStageModal('Final', {
            title: 'Juego Completado',
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'Terminar Configuracion',
            cancelButtonText: 'Volver a Jugar',
            confirmButtonColor: '#0077b6',
          });
          // Reiniciar a configuración
          setGameState("config");
          setPickedExercises([]);
          setStepIndex(0);
          setEncryptedText("");
          setAnswer("");
        }
      } else {
        // Canceló, volver a config
        setGameState("config");
        setPickedExercises([]);
        setStepIndex(0);
        setEncryptedText("");
        setAnswer("");
      }
    } else {
      if (!ensureSwal()) return;
      const result = await window.Swal.fire({
        title: 'Error!',
        text: `Incorrecto. La respuesta era: "${ex.frase}"`,
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reiniciar juego',
        cancelButtonText: 'Finalizar juego',
        confirmButtonColor: '#0077b6',
      });
      if (result?.isConfirmed) {
        // Reinicia el juego
        setPickedExercises([]);
        setStepIndex(0);
        setScore(0);
        setEncryptedText("");
        setAnswer("");
        setGameState("welcome");
      } else {
        // Finaliza
        setGameState("config");
        setPickedExercises([]);
        setStepIndex(0);
        setScore(0);
        setEncryptedText("");
        setAnswer("");
      }
    }
  };

  // =======================
  // 10) UI (VISTA PREVIA)
  // =======================

  const renderPreviewArea = () => {
    if (gameState === "config") {
      return (
        <div className="enc-preview-placeholder">
          Selecciona tus opciones y presiona “Vista previa” para comenzar.
        </div>
      );
    }

    if (gameState === "welcome") {
      return (
        <div className="enc-preview-welcome">
          <h2>Bienvenido a Encriptación</h2>
          <p>Descifra el mensaje escribiendo la frase original.</p>
          <button className="enc-btn primary" onClick={handleStartGame}>
            Iniciar juego
          </button>
        </div>
      );
    }

    // playing
    return (
      <div className="enc-game-layout">
        <div className="enc-game-content">
          <div className="enc-hint">
            <b>Nota:</b> Los espacios en el mensaje encriptado indican separación entre palabras.
          </div>

          <div className="enc-encrypted-display">{encryptedText}</div>

          <div className="enc-answer-row">
            <input
              className="enc-input"
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && answer.trim()) handleVerify();
              }}
              placeholder="Escribe tu respuesta aquí..."
              autoFocus
            />
            <button className="enc-btn success" disabled={!answer.trim()} onClick={handleVerify}>
              Verificar
            </button>
          </div>

          <div className="enc-score">Puntuación: {score}</div>
          <div className="enc-progress">
            Ejercicio {Math.min(stepIndex + 1, pickedExercises.length)} de {pickedExercises.length}
          </div>
        </div>

        <div className="enc-image-reference">
          {/*
            IMPORTANTE:
            - Esta imagen debe existir en /public/Encriptación.jpg
            - Si tu generador la coloca en otra ruta, ajusta el src.
          */}
          <img src="/encrip/Encriptación.jpg" alt="Tabla de cifrado" />
        </div>
      </div>
    );
  };

  // =======================
  // 11) RENDER PRINCIPAL
  // =======================

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');

        :root {
          --primary: #007bff;
          --secondary: #6c757d;
          --success: #28a745;
          --danger: #dc3545;
          --light: #f8f9fa;
          --dark: #343a40;
          --confirm-color: #0077b6;
          --font-family: 'Poppins', sans-serif;
        }

        .enc-layout {
          display: flex;
          gap: 2rem;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 1rem;
        }

        .enc-panel {
          background: white;
          border-radius: 16px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
          padding: 2rem;
        }

        .enc-config {
          flex: 1;
          min-width: 320px;
        }

        .enc-preview {
          flex: 2;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .enc-title {
          margin: 0 0 1.5rem 0;
          color: var(--primary);
          text-align: center;
          font-weight: 700;
          font-size: 2rem;
        }

        .enc-section {
          background: #f8f9fa;
          border-radius: 14px;
          padding: 1rem 1.2rem;
          margin-top: 1rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .enc-label {
          display: block;
          font-weight: 600;
          color: var(--dark);
          margin-bottom: 0.5rem;
        }

        .enc-field {
          width: 100%;
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px solid #ced4da;
          background: white;
          font-size: 1rem;
          font-family: 'Poppins', sans-serif;
        }

        .enc-field:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
        }

        .enc-btn {
          background: var(--primary);
          color: white;
          border: none;
          padding: 0.85rem 1.4rem;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 1rem;
          transition: background-color 0.3s ease;
          width: 100%;
          margin-top: 1rem;
        }

        .enc-btn:hover { background-color: #0056b3; }
        .enc-btn:disabled { opacity: 0.6; cursor: not-allowed; background-color: var(--secondary); }

        .enc-btn.primary { background-color: var(--primary); }
        .enc-btn.primary:hover { background-color: #0056b3; }
        .enc-btn.success { background-color: var(--success); }
        .enc-btn.success:hover { background-color: #1e7e34; }

        /* RA cards */
        .ra-stage-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
          max-height: 270px;
          overflow-y: auto;
        }

        .ra-stage-card {
          border: 1px solid rgba(2, 62, 138, 0.15);
          border-radius: 14px;
          padding: 12px 14px;
          background: white;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .ra-stage-card.is-active {
          border-color: var(--primary);
          box-shadow: 0 10px 24px rgba(0, 119, 182, 0.2);
          background: linear-gradient(160deg, rgba(0, 119, 182, 0.08), rgba(255, 255, 255, 0.95));
        }

        .ra-stage-toggle {
          display: flex;
          gap: 0.6rem;
          align-items: center;
          font-weight: 600;
          color: var(--dark);
          cursor: pointer;
          user-select: none;
        }

        .ra-stage-toggle input {
          accent-color: var(--primary);
        }

        .ra-stage-body { margin-top: 0.75rem; padding-left: 0.5rem; display: grid; gap: 0.6rem; }
        .ra-field-label { font-weight: 600; color: var(--dark); font-size: 0.9rem; }

        .ra-preview-btn {
          background-color: rgba(0, 119, 182, 0.1);
          color: var(--dark);
          border: 1px solid rgba(0, 119, 182, 0.3);
          font-weight: 600;
          padding: 0.65rem 1rem;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        .ra-preview-btn:hover { background-color: rgba(0, 119, 182, 0.18); }

        /* Preview panel */
        .enc-preview h2 { margin: 0; color: var(--primary); }

        .enc-preview-placeholder {
          display: grid;
          place-items: center;
          height: 100%;
          min-height: 360px;
          color: var(--secondary);
          text-align: center;
          border: 2px dashed var(--primary);
          border-radius: 12px;
          background-color: var(--light);
        }

        .enc-preview-welcome {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 360px;
          text-align: center;
          background-color: var(--light);
          border: 2px dashed var(--primary);
          border-radius: 12px;
          padding: 2rem;
        }

        .enc-preview-welcome h2 {
          margin-bottom: 0.5rem;
          color: var(--primary);
        }

        .enc-preview-welcome p {
          margin-bottom: 2rem;
          color: var(--secondary);
        }

        .enc-game-layout {
          display: flex;
          gap: 1.6rem;
          align-items: flex-start;
        }

        .enc-game-content { flex: 1; min-width: 0; }

        .enc-hint {
          color: var(--primary);
          font-size: 0.95rem;
          text-align: center;
          margin-bottom: 0.8rem;
          font-weight: 600;
        }

        .enc-encrypted-display {
          font-size: 2rem;
          font-weight: 700;
          color: var(--dark);
          margin: 0.8rem 0;
          min-height: 60px;
          text-align: center;
          background: var(--light);
          border-radius: 12px;
          border: 2px dashed var(--primary);
          padding: 1rem 0.8rem;
          letter-spacing: 3px;
          word-break: break-word;
          font-family: 'Courier New', monospace;
        }

        .enc-answer-row {
          display: flex;
          gap: 0.8rem;
          margin-top: 1rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        .enc-input {
          flex: 1;
          min-width: 220px;
          padding: 0.75rem 1rem;
          border: 2px solid #ced4da;
          border-radius: 8px;
          font-size: 1.05rem;
          font-weight: 600;
          text-align: center;
          background: white;
          transition: border-color 0.2s ease;
        }

        .enc-input:focus {
          outline: none;
          border-color: var(--primary);
        }

        .enc-score {
          margin-top: 1rem;
          font-weight: 600;
          text-align: center;
          color: var(--primary);
          font-size: 1.5rem;
        }

        .enc-progress {
          margin-top: 0.6rem;
          text-align: center;
          color: var(--secondary);
          font-weight: 600;
        }

        .enc-image-reference {
          flex: 0 0 340px;
          display: flex;
          justify-content: center;
        }

        .enc-image-reference img {
          width: 100%;
          max-width: 340px;
          height: auto;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          border: 2px solid #ced4da;
          background: white;
          padding: 8px;
        }

        @media (max-width: 980px) {
          .enc-layout { flex-direction: column; }
          .enc-config, .enc-preview { width: 100%; }
          .enc-image-reference { flex: 1 1 auto; }
          .enc-game-layout { flex-direction: column; }
        }

        /* ======================= */
        /* SweetAlert2 (RA Modals) */
        /* ======================= */

        .swal2-popup { border-radius: 28px !important; }
        .swal2-title { font-family: 'Poppins', sans-serif; }
        .swal2-html-container { font-family: 'Poppins', sans-serif; }
        .swal2-cancel {
          background-color: white !important;
          color: #0077b6 !important;
          border: 2px solid #0077b6 !important;
        }
        .swal2-cancel:hover { background-color: rgba(0, 123, 255, 0.05) !important; }

        .enc-ar-bg {
          position: relative;
          min-height: 220px;
          width: 100%;
          background: linear-gradient(135deg, #0077b6 0%, #023e8a 100%);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1.2rem;
          padding: 1.2rem 0;
          border-radius: 28px;
        }

        /* Cuando se usa cámara, quitamos el fondo azul */
        .enc-ar-bg-camera {
          background: transparent;
        }

        /* Video de la cámara como fondo */
        .enc-ar-camera-bg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 0;
          border-radius: 28px;
        }

        .enc-ar-bg-elements {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 20% 20%, rgba(255,255,255,0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(255,255,255,0.1) 0%, transparent 50%);
          pointer-events: none;
        }

        .enc-ar-content {
          position: relative;
          z-index: 2;
          width: 100%;
          padding: 0 1rem;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .enc-ar-top {
          color: #ffd60a;
          font-weight: 800;
          text-shadow: 2px 2px 8px #3a0ca3, 0 0 20px rgba(0,0,0,0.8);
          text-align: center;
          background: rgba(0, 0, 0, 0.4);
          padding: 0.8rem 1.5rem;
          border-radius: 12px;
          backdrop-filter: blur(5px);
        }

        .enc-ar-three-wrap {
          width: 100%;
          height: 240px;
          overflow: hidden;
          position: relative;
          z-index: 1;
        }

        .ra-three-wrap {
          width: 100%;
          height: 240px;
          border: 1px solid rgba(2, 62, 138, 0.15);
          border-radius: 12px;
          background: #f6fbff;
          overflow: hidden;
        }

        .ra-three-canvas {
          width: 100%;
          height: 100%;
        }
      `}</style>

      <div className="enc-layout">
        <div className="enc-panel enc-config">
          <h1 className="enc-title">Encriptación</h1>

          {setupStep === "ar" ? (
            <>
              <h2 style={{ margin: 0, color: "var(--primary)", textAlign: "center" }}>
                Configuración de RA
              </h2>

              <div className="enc-section">
                <span className="enc-label">Etapas a habilitar:</span>
                <div className="ra-stage-list">
                  {AR_STAGES.map((stage) => (
                    <div
                      key={stage}
                      className={`ra-stage-card ${arSelectedStages?.[stage] ? "is-active" : ""}`}
                    >
                      <label className="ra-stage-toggle">
                        <input
                          type="checkbox"
                          checked={!!arSelectedStages?.[stage]}
                          onChange={() => toggleARStage(stage)}
                        />
                        <span>{stage}</span>
                      </label>

                      {arSelectedStages?.[stage] && (
                        <div className="ra-stage-body">
                          <label className="ra-field-label">Tipo de contenido:</label>
                          <select
                            className="enc-field"
                            value={arConfig?.[stage]?.type ?? "Texto"}
                            onChange={(e) => setARStageType(stage, e.target.value)}
                          >
                            {AR_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                          {(arConfig?.[stage]?.type === "Texto") && (
                            <>
                              <label className="ra-field-label">Texto (máx. 20):</label>
                              <textarea
                                className="enc-field"
                                rows={3}
                                value={arConfig?.[stage]?.text ?? ""}
                                onChange={(e) => setARStageField(stage, "text", e.target.value.slice(0, 20))}
                                placeholder="Escribe el mensaje..."
                              />
                            </>
                          )}

                          {arConfig?.[stage]?.type === "Imagen" && (
                            <>
                              <label className="ra-field-label">Archivo de imagen:</label>
                              <input
                                className="enc-field"
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  handleARStageFileChange(stage, "imageUrl", e.target.files?.[0] ?? null)
                                }
                              />
                            </>
                          )}

                          {arConfig?.[stage]?.type === "Audio" && (
                            <>
                              <label className="ra-field-label">Archivo de audio:</label>
                              <input
                                className="enc-field"
                                type="file"
                                accept="audio/*"
                                onChange={(e) =>
                                  handleARStageFileChange(stage, "audioUrl", e.target.files?.[0] ?? null)
                                }
                              />
                            </>
                          )}

                          {arConfig?.[stage]?.type === "Video" && (
                            <>
                              <label className="ra-field-label">Archivo de video:</label>
                              <input
                                className="enc-field"
                                type="file"
                                accept="video/*"
                                onChange={(e) =>
                                  handleARStageFileChange(stage, "videoUrl", e.target.files?.[0] ?? null)
                                }
                              />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button className="enc-btn primary" onClick={saveARConfigAndContinue}>
                Guardar RA y continuar
              </button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0, color: "var(--primary)" }}>Configuración del juego</h2>
                <button
                  className="ra-preview-btn"
                  onClick={() => setSetupStep("ar")}
                  title="Editar configuración de RA"
                >
                  Editar RA
                </button>
              </div>

              <div className="enc-section">
                <label className="enc-label">Selecciona nivel:</label>
                <select
                  className="enc-field"
                  value={gameConfig.level}
                  onChange={(e) => setGameConfig((prev) => ({ ...prev, level: e.target.value }))}
                >
                  <option value="basico">Básico</option>
                  <option value="intermedio">Intermedio</option>
                  <option value="avanzado">Avanzado</option>
                </select>

                <label className="enc-label" style={{ marginTop: "0.8rem" }}>
                  Número de ejercicios (disponibles: {availableCount || 0}):
                </label>
                <input
                  className="enc-field"
                  type="number"
                  min={1}
                  max={Math.max(1, availableCount || 1)}
                  value={gameConfig.exerciseCount}
                  onChange={(e) =>
                    setGameConfig((prev) => ({
                      ...prev,
                      exerciseCount: Math.max(1, Math.min(availableCount || 1, Number(e.target.value) || 1)),
                    }))
                  }
                  disabled={availableCount === 0}
                />

                <button className="enc-btn" onClick={prepareRun} disabled={availableCount === 0}>
                  Vista previa
                </button>
              </div>
            </>
          )}
        </div>

        <div className="enc-panel enc-preview">
          <h2>Vista previa</h2>
          {renderPreviewArea()}
        </div>
      </div>
    </>
  );
}
