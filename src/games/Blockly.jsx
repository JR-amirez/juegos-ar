import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// =======================
// CONFIGURACIÓN RA (localStorage)
// =======================
const STORAGE_NS = "ar:blockly";
const LS = {
  arStages: `${STORAGE_NS}:selectedStages`,
  arConfig: `${STORAGE_NS}:config`,
};

const AR_STAGES = ["Acierto"]; // Solo Acierto para Blockly

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
  } catch {}
};

// =======================
// THREE.JS (CARGA LAZY)
// =======================
const useThreeLoaders = () => {
  const threeLoadRef = useRef(null);
  const threeAddonsRef = useRef(null);

  const ensureThree = useCallback(() => {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (threeLoadRef.current) return threeLoadRef.current;

    threeLoadRef.current = import("https://esm.sh/three@0.160.1")
      .then((mod) => {
        const THREE = { ...mod };
        window.THREE = THREE;
        return THREE;
      })
      .catch(() => {
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
  }, []);

  const ensureThreeTextAddons = useCallback(() => {
    if (threeAddonsRef.current) return threeAddonsRef.current;

    threeAddonsRef.current = ensureThree().then(async (THREE) => {
      const [{ FontLoader }, { TextGeometry }] = await Promise.all([
        import("https://esm.sh/three@0.160.1/addons/loaders/FontLoader.js"),
        import("https://esm.sh/three@0.160.1/addons/geometries/TextGeometry.js"),
      ]);

      return { THREE, FontLoader, TextGeometry };
    });

    return threeAddonsRef.current;
  }, [ensureThree]);

  return { ensureThree, ensureThreeTextAddons };
};

// =======================
// SÍMBOLOS FLOTANTES (Blockly themed)
// =======================
const BLOCKLY_SYMBOLS = ["{ }", "< >", "( )", "[ ]", "=>", "++", "&&", "||"];

function createFloatingSymbols(container) {
  if (!container) return () => {};

  const uid = `blockly_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const nodes = [];
  const styles = [];

  BLOCKLY_SYMBOLS.forEach((symbol, index) => {
    const el = document.createElement("div");
    el.textContent = symbol;

    const size = Math.random() * 26 + 18;
    const duration = Math.random() * 5 + 5;
    const left = Math.random() * 80 + 10;
    const top = Math.random() * 80 + 10;
    const dx = Math.random() * 30 - 15;
    const dy = Math.random() * 30 - 15;
    const rot = Math.random() * 30 - 15;

    const animName = `blocklyFloat_${uid}_${index}`;

    el.style.cssText = `
      position: absolute;
      color: rgba(255,255,255,0.22);
      font-size: ${size}px;
      font-family: monospace;
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
    <div class="blockly-ar-bg ${useCamera ? 'blockly-ar-bg-camera' : ''}">
      ${useCamera ? `<video id="${videoId}" class="blockly-ar-camera-bg" autoplay playsinline muted></video>` : ''}
      <div id="${bgId}" class="blockly-ar-bg-elements"></div>
      <div class="blockly-ar-content">${topHtml}${innerHtml}</div>
    </div>
  `;
}

// =======================
// RENDER 3D POR ETAPA
// =======================
function initThreeStageFactory({ ensureThree, ensureThreeTextAddons }) {
  return function initThreeStage(container, stageCfg) {
    if (!container) return () => {};

    let disposed = false;
    let rafId = 0;
    let renderer;
    let scene;
    let camera;
    let videoEl;
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

      const ambient = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambient);
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(3, 5, 4);
      scene.add(dir);

      /* const bgGeo = new THREE.SphereGeometry(18, 32, 32);
      const bgMat = new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.12, side: THREE.BackSide });
      const bg = new THREE.Mesh(bgGeo, bgMat);
      scene.add(bg); */

      const createGlowTexture = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        canvas.width = 256;
        canvas.height = 256;
        const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
        grad.addColorStop(0, "rgba(99, 102, 241, 0.45)");
        grad.addColorStop(0.45, "rgba(129, 140, 248, 0.2)");
        grad.addColorStop(1, "rgba(165, 180, 252, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      };

      const portalFrameMaterial = new THREE.MeshStandardMaterial({
        color: 0xa5b4fc,
        emissive: 0x6366f1,
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

      if (stageCfg.type === "Texto") {
        const { FontLoader, TextGeometry } = await ensureThreeTextAddons();

        const loader = new FontLoader();
        const font = await new Promise((resolve, reject) => {
          loader.load(
            "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json",
            resolve,
            undefined,
            reject
          );
        });

        const text = (stageCfg.text || "").trim().slice(0, 20) || "Blockly";
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
        const root = new THREE.Group();
        scene.add(root);

        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })
        );
        root.add(plane);

        const planeBack = new THREE.Mesh(
          plane.geometry.clone(),
          plane.material.clone()
        );
        planeBack.rotation.y = Math.PI;
        planeBack.visible = false;
        root.add(planeBack);

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

        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load(
          stageCfg.imageUrl || "",
          (texture) => {
            if (disposed) return;
            texture.colorSpace = THREE.SRGBColorSpace;
            plane.material.map = texture;
            plane.material.needsUpdate = true;

            const backTexture = texture.clone();
            backTexture.colorSpace = THREE.SRGBColorSpace;
            backTexture.wrapS = THREE.RepeatWrapping;
            backTexture.repeat.x = -1;
            backTexture.offset.x = 1;
            backTexture.needsUpdate = true;
            planeBack.material.map = backTexture;
            planeBack.material.needsUpdate = true;
            planeBack.visible = true;

            fitPlaneToAspect(texture.image.width / texture.image.height);
          },
          undefined,
          () => {
            if (!disposed && container) {
              container.textContent = "No se pudo cargar la imagen.";
            }
          }
        );

        const animate = () => {
          if (disposed) return;
          root.rotation.y += 0.01;
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

        const videoTexture = new THREE.VideoTexture(videoEl);
        videoTexture.colorSpace = THREE.SRGBColorSpace;

        portalGroup = new THREE.Group();
        scene.add(portalGroup);

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

        portalFrameGroup = new THREE.Group();
        portalGroup.add(portalFrameGroup);

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
          color: 0xa5b4fc,
          size: 0.05,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        portalParticles = new THREE.Points(particleGeo, particleMat);
        portalGroup.add(portalParticles);

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

        fitPlaneToAspect(16 / 9);

        videoMetadataHandler = () => {
          if (videoEl.videoWidth && videoEl.videoHeight) {
            fitPlaneToAspect(videoEl.videoWidth / videoEl.videoHeight);
          }
        };
        videoEl.addEventListener("loadedmetadata", videoMetadataHandler);
        videoEl.play().catch(() => {});

        toggleClickHandler = () => {
          if (videoEl.paused) {
            videoEl.muted = false;
            videoEl.play().catch(() => {});
          } else {
            videoEl.pause();
          }
        };
        container.addEventListener("click", toggleClickHandler);

        const animate = () => {
          if (disposed) return;

          const now = performance.now();
          const floatY = Math.sin(now * 0.0011) * 0.06;
          const floatX = Math.cos(now * 0.0009) * 0.02;
          portalGroup.position.y = floatY;
          portalGroup.position.x = floatX;
          portalGroup.rotation.z = Math.sin(now * 0.0006) * 0.04;
          portalGroup.rotation.y = Math.cos(now * 0.0005) * 0.04;

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
        const noteMaterial = new THREE.MeshStandardMaterial({
          color: 0xa5b4fc,
          emissive: 0x6366f1,
          emissiveIntensity: 0.5,
          roughness: 0.2,
          metalness: 0.1,
        });

        const noteGroup = new THREE.Group();

        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 24, 24),
          noteMaterial
        );
        head.position.set(-0.15, -0.1, 0);
        noteGroup.add(head);

        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.8, 12),
          noteMaterial
        );
        stem.position.set(0.1, 0.35, 0);
        noteGroup.add(stem);

        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.12, 0.08),
          noteMaterial
        );
        flag.position.set(0.35, 0.68, 0);
        flag.rotation.z = -0.35;
        noteGroup.add(flag);

        noteGroup.scale.set(2, 2, 2);
        scene.add(noteGroup);

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

        toggleClickHandler = () => {
          if (!audioInstance.buffer) return;
          if (audioInstance.isPlaying) audioInstance.pause();
          else audioInstance.play().catch(() => {});
        };
        container.addEventListener("click", toggleClickHandler);

        const animate = () => {
          if (disposed) return;

          if (noteGroup && audioAnalyser) {
            const raw = audioAnalyser.getAverageFrequency() / 255;
            notePulse += (raw - notePulse) * 0.15;
            const scale = 1 + notePulse * 0.5;
            noteGroup.scale.setScalar(scale * 2);
            noteGroup.position.y = notePulse * 0.35;
          }

          renderer.render(scene, camera);
          rafId = requestAnimationFrame(animate);
        };
        animate();
      }

      resizeObserver = new ResizeObserver(() => {
        if (!renderer || !camera || disposed) return;
        const nw = Math.max(260, container.clientWidth);
        const nh = Math.max(220, container.clientHeight);
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
      });
      resizeObserver.observe(container);
    })().catch(() => {});

    return cleanup;
  };
}

// --- Carga de SweetAlert2 ---
// Este componente carga el script de SweetAlert2
const SweetAlertLoader = ({ onLoaded }) => {
  useEffect(() => {
    // 1. Si ya está cargado (de una carga anterior), avisar y salir.
    if (window.Swal) {
      onLoaded();
      return;
    }

    // 2. Si ya estamos cargándolo (flag), no hacer nada.
    //    El 'onload' original se encargará de avisar.
    if (window.swalScriptLoading) {
      // Si por alguna razón el flag está pero Swal existe, forzamos
      if (window.Swal) {
        onLoaded();
      }
      return;
    }

    // 3. Marcar que estamos cargando
    window.swalScriptLoading = true;

    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/sweetalert2@11"; // Corregido: de '//' a 'https://'
    script.async = true;
    script.onload = () => {
      onLoaded();
      window.swalScriptLoading = false;
    };
    script.onerror = () => {
      console.error("SweetAlert2 script failed to load.");
      window.swalScriptLoading = false;
    };
    document.body.appendChild(script);

  }, [onLoaded]); // onLoaded es estable
  return null;
};

// --- Carga de Blockly ---
// Carga la biblioteca principal de Blockly y el módulo de idioma español
const BlocklyLoader = ({ onLoaded }) => { // Prop renombrada y eliminada la duplicación
  useEffect(() => {
    // 1. Si ya está cargado, avisar y salir
    // (Comprobamos 'Msg' porque es lo último que se carga)
    if (window.Blockly && window.Blockly.Msg && window.Blockly.Msg.ES) {
      onLoaded();
      return;
    }

    // 2. Si ya estamos cargando, no hacer nada.
    if (window.blocklyScriptLoading) {
      return;
    }
    
    // 3. Marcar que estamos cargando
    window.blocklyScriptLoading = true;

    const blocklyScript = document.createElement('script');
    blocklyScript.src = "https://unpkg.com/blockly/blockly.min.js";
    blocklyScript.async = true;
    blocklyScript.onload = () => {
      const langScript = document.createElement('script');
      langScript.src = "https://unpkg.com/blockly/msg/es.js";
      langScript.async = true;
      langScript.onload = () => {
        // Scripts cargados
        onLoaded(); // Usar la nueva prop
        window.blocklyScriptLoading = false;
      };
      langScript.onerror = () => {
        console.error("Blockly 'es' language script failed to load.");
        window.blocklyScriptLoading = false;
      };
      document.body.appendChild(langScript);
    };
    blocklyScript.onerror = () => {
      console.error("Blockly core script failed to load.");
      window.blocklyScriptLoading = false;
    };
    document.body.appendChild(blocklyScript);
  }, [onLoaded]); // Actualizar dependencia
  return null;
};


// --- Estilos de Tailwind (Scoped) ---
// Estilos limitados al contenedor .blockly-scope para evitar afectar otros componentes
const TailwindStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');

    .blockly-scope {
      font-family: 'Poppins', sans-serif;
      color: #343a40;
      --primary-color: #007bff;
      --secondary-color: #6c757d;
      --success-color: #28a745;
      --danger-color: #dc3545;
      --light-color: #f8f9fa;
      --dark-color: #343a40;
      --confirm-color: #0077b6;
      --font-family: 'Poppins', sans-serif;
    }

    .blockly-scope .font-sans { font-family: 'Poppins', sans-serif; }

    @keyframes blockly-bounce {
      0%, 100% {
        transform: translateY(-5%) scale(1.05);
        text-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      }
      50% {
        transform: translateY(0) scale(1);
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }
    }
    .blockly-title-animate {
      animation: blockly-bounce 2s ease-in-out infinite;
    }

    /* Estilos base scoped a .blockly-scope */
    .blockly-scope *,.blockly-scope ::before,.blockly-scope ::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e5e7eb}
    .blockly-scope button,.blockly-scope input,.blockly-scope optgroup,.blockly-scope select,.blockly-scope textarea{font-family:inherit;font-size:100%;font-weight:inherit;line-height:inherit;color:inherit;margin:0;padding:0}
    .blockly-scope button,.blockly-scope select{text-transform:none}
    .blockly-scope [type=button],.blockly-scope [type=reset],.blockly-scope [type=submit],.blockly-scope button{-webkit-appearance:button;background-color:transparent;background-image:none}
    .blockly-scope :disabled{cursor:default;opacity:0.7}
    .blockly-scope img,.blockly-scope svg,.blockly-scope video,.blockly-scope canvas,.blockly-scope audio,.blockly-scope iframe,.blockly-scope embed,.blockly-scope object{display:block;vertical-align:middle}
    .blockly-scope img,.blockly-scope video{max-width:100%;height:auto}
    .blockly-scope [hidden]{display:none}

    /* Clases de utilidad scoped */
    .blockly-scope .relative{position:relative}
    .blockly-scope .mx-auto{margin-left:auto;margin-right:auto}
    .blockly-scope .mx-2{margin-left:.5rem;margin-right:.5rem}
    .blockly-scope .my-4{margin-top:1rem;margin-bottom:1rem}
    .blockly-scope .my-6{margin-top:1.5rem;margin-bottom:1.5rem}
    .blockly-scope .mb-2{margin-bottom:.5rem}
    .blockly-scope .mb-4{margin-bottom:1rem}
    .blockly-scope .mb-6{margin-bottom:1.5rem}
    .blockly-scope .mb-8{margin-bottom:2rem}
    .blockly-scope .mt-1{margin-top:.25rem}
    .blockly-scope .mt-2{margin-top:.5rem}
    .blockly-scope .mt-4{margin-top:1rem}
    .blockly-scope .mt-6{margin-top:1.5rem}
    .blockly-scope .mt-8{margin-top:2rem}
    .blockly-scope .mr-2{margin-right:.5rem}
    .blockly-scope .ml-2{margin-left:.5rem}
    .blockly-scope .inline-block{display:inline-block}
    .blockly-scope .grid{display:grid}
    .blockly-scope .h-10{height:2.5rem}
    .blockly-scope .h-16{height:4rem}
    .blockly-scope .h-32{height:8rem}
    .blockly-scope .h-full{height:100%}
    .blockly-scope .min-h-screen{min-height:100vh}
    .blockly-scope .w-full{width:100%}
    .blockly-scope .w-1\\/2{width:50%}
    .blockly-scope .w-1\\/3{width:33.333333%}
    .blockly-scope .w-2\\/3{width:66.666667%}
    .blockly-scope .w-1\\/4{width:25%}
    .blockly-scope .w-1\\/5{width:20%}
    .blockly-scope .max-w-7xl{max-width:80rem}
    .blockly-scope .flex-1{flex:1 1 0%}
    .blockly-scope .flex-shrink-0{flex-shrink:0}
    .blockly-scope .grow{flex-grow:1}
    .blockly-scope .cursor-pointer{cursor:pointer}
    .blockly-scope .flex-col{flex-direction:column}
    .blockly-scope .items-start{align-items:flex-start}
    .blockly-scope .items-center{align-items:center}
    .blockly-scope .justify-start{justify-content:flex-start}
    .blockly-scope .justify-center{justify-content:center}
    .blockly-scope .justify-between{justify-content:space-between}
    .blockly-scope .gap-2{gap:.5rem}
    .blockly-scope .gap-4{gap:1rem}
    .blockly-scope .gap-6{gap:1.5rem}
    .blockly-scope .gap-8{gap:2rem}
    .blockly-scope .overflow-auto{overflow:auto}
    .blockly-scope .overflow-hidden{overflow:hidden}
    .blockly-scope .overflow-y-auto{overflow-y:auto}
    .blockly-scope .rounded-lg{border-radius:.5rem}
    .blockly-scope .rounded-xl{border-radius:.75rem}
    .blockly-scope .rounded-full{border-radius:9999px}
    .blockly-scope .border{border-width:1px}
    .blockly-scope .border-2{border-width:2px}
    .blockly-scope .border-gray-200{border-color:rgb(229 231 235)}
    .blockly-scope .border-gray-300{border-color:rgb(209 213 219)}
    .blockly-scope .border-blue-500{border-color:rgb(59 130 246)}
    .blockly-scope .bg-white{background-color:rgb(255 255 255)}
    .blockly-scope .bg-gray-100{background-color:rgb(243 244 246)}
    .blockly-scope .bg-gray-200{background-color:rgb(229 231 235)}
    .blockly-scope .bg-gray-50{background-color:rgb(249 250 251)}
    .blockly-scope .bg-blue-100{background-color:rgb(219 234 254)}
    .blockly-scope .bg-blue-500{background-color:rgb(59 130 246)}
    .blockly-scope .bg-blue-600{background-color:rgb(37 99 235)}
    .blockly-scope .bg-blue-700{background-color:rgb(29 78 216)}
    .blockly-scope .bg-green-100{background-color:rgb(220 252 231)}
    .blockly-scope .bg-green-200{background-color:rgb(187 247 208)}
    .blockly-scope .bg-green-500{background-color:rgb(34 197 94)}
    .blockly-scope .bg-green-600{background-color:rgb(22 163 74)}
    .blockly-scope .bg-red-500{background-color:rgb(239 68 68)}
    .blockly-scope .hover\\:bg-red-600:hover{background-color:rgb(220 38 38)}
    .blockly-scope .bg-teal-500{background-color:rgb(20 184 166)}
    .blockly-scope .bg-teal-600{background-color:rgb(13 148 136)}
    .blockly-scope .p-1{padding:.25rem}
    .blockly-scope .p-2{padding:.5rem}
    .blockly-scope .p-3{padding:.75rem}
    .blockly-scope .p-4{padding:1rem}
    .blockly-scope .p-6{padding:1.5rem}
    .blockly-scope .p-8{padding:2rem}
    .blockly-scope .px-2{padding-left:.5rem;padding-right:.5rem}
    .blockly-scope .px-3{padding-left:.75rem;padding-right:.75rem}
    .blockly-scope .px-4{padding-left:1rem;padding-right:1rem}
    .blockly-scope .px-6{padding-left:1.5rem;padding-right:1.5rem}
    .blockly-scope .py-1{padding-top:.25rem;padding-bottom:.25rem}
    .blockly-scope .py-2{padding-top:.5rem;padding-bottom:.5rem}
    .blockly-scope .py-3{padding-top:.75rem;padding-bottom:.75rem}
    .blockly-scope .py-4{padding-top:1rem;padding-bottom:1rem}
    .blockly-scope .pb-4{padding-bottom:1rem}
    .blockly-scope .pt-2{padding-top:.25rem}
    .blockly-scope .pt-4{padding-top:1rem}
    .blockly-scope .text-center{text-align:center}
    .blockly-scope .text-left{text-align:left}
    .blockly-scope .text-xs{font-size:.75rem;line-height:1rem}
    .blockly-scope .text-sm{font-size:.875rem;line-height:1.25rem}
    .blockly-scope .text-lg{font-size:1.125rem;line-height:1.75rem}
    .blockly-scope .text-xl{font-size:1.25rem;line-height:1.75rem}
    .blockly-scope .text-2xl{font-size:1.5rem;line-height:2rem}
    .blockly-scope .text-3xl{font-size:1.875rem;line-height:2.25rem}
    .blockly-scope .text-4xl{font-size:2.25rem;line-height:2.5rem}
    .blockly-scope .font-bold{font-weight:700}
    .blockly-scope .font-semibold{font-weight:600}
    .blockly-scope .font-medium{font-weight:500}
    .blockly-scope .text-white{color:rgb(255 255 255)}
    .blockly-scope .text-gray-400{color:rgb(156 163 175)}
    .blockly-scope .text-gray-500{color:rgb(107 114 128)}
    .blockly-scope .text-gray-600{color:rgb(75 85 99)}
    .blockly-scope .text-gray-700{color:rgb(55 65 81)}
    .blockly-scope .text-gray-800{color:rgb(31 41 55)}
    .blockly-scope .text-gray-900{color:rgb(17 24 39)}
    .blockly-scope .text-blue-600{color:rgb(37 99 235)}
    .blockly-scope .text-blue-800{color:rgb(30 64 175)}
    .blockly-scope .text-green-600{color:rgb(22 163 74)}
    .blockly-scope .text-green-700{color:rgb(21 128 61)}
    .blockly-scope .text-green-800{color:rgb(22 101 52)}
    .blockly-scope .shadow-lg{box-shadow:0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1)}
    .blockly-scope .shadow-md{box-shadow:0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1)}
    .blockly-scope .shadow-sm{box-shadow:0 1px 2px 0 rgb(0 0 0 / .05)}
    .blockly-scope .shadow-inner{box-shadow:inset 0 2px 4px 0 rgb(0 0 0 / .05)}
    .blockly-scope .transition-colors{transition-property:color, background-color, border-color;transition-timing-function:cubic-bezier(.4, 0, .2, 1);transition-duration:.15s}
    .blockly-scope .transition-transform{transition-property:transform;transition-timing-function:cubic-bezier(.4, 0, .2, 1);transition-duration:.15s}
    .blockly-scope .transition-all{transition-property:all;transition-timing-function:cubic-bezier(.4, 0, .2, 1);transition-duration:.15s}
    .blockly-scope .duration-200{transition-duration:.2s}
    .blockly-scope .duration-300{transition-duration:.3s}
    .blockly-scope .ease-in-out{transition-timing-function:cubic-bezier(.4, 0, .2, 1)}
    .blockly-scope .hover\\:scale-105:hover{transform:scale(1.05)}
    .blockly-scope .hover\\:border-blue-500:hover{border-color:rgb(59 130 246)}
    .blockly-scope .hover\\:bg-blue-700:hover{background-color:rgb(29 78 216)}
    .blockly-scope .hover\\:bg-green-600:hover{background-color:rgb(22 163 74)}
    .blockly-scope .hover\\:bg-teal-600:hover{background-color:rgb(13 148 136)}
    .blockly-scope .hover\\:shadow-lg:hover{box-shadow:0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1)}
    .blockly-scope .focus\\:outline-none:focus{outline:2px solid transparent;outline-offset:2px}
    .blockly-scope .focus\\:ring-2:focus{box-shadow:0 0 0 2px rgb(59 130 246 / .5)}
    .blockly-scope .disabled\\:opacity-50:disabled{opacity:.5}
    .blockly-scope .disabled\\:cursor-not-allowed:disabled{cursor:not-allowed}
    .blockly-scope .grid-cols-2{grid-template-columns:repeat(2, minmax(0, 1fr))}
    .blockly-scope .grid-cols-4{grid-template-columns:repeat(4, minmax(0, 1fr))}
    .blockly-scope .flex{display:flex}
    .blockly-scope .hidden{display:none}
    .blockly-scope .flex-wrap{flex-wrap:wrap}
    .blockly-scope .transform{transform:translate(var(--tw-translate-x,0), var(--tw-translate-y,0)) rotate(var(--tw-rotate,0)) scale(var(--tw-scale-x,1), var(--tw-scale-y,1))}

    /* Estilos adicionales para el workspace de Blockly */
    .blockly-workspace {
      width: 100%;
      height: 100%;
      min-height: 500px;
    }
    .blockly-toolbox-bg {
      background-color: #f0f0f0;
    }
    .blockly-trash-can {
      background-color: #f0f0f0;
      padding: 4px;
      border-radius: 4px;
    }
    .blockly-dotted-grid {
      background-image: radial-gradient(circle, #ccc 1px, transparent 1px);
      background-size: 16px 16px;
    }
  `}</style>
);

// --- Estilos de RA ---
const BlocklyARStyles = () => (
  <style>{`
    /* ===================== */
    /* Animaciones RA */
    /* ===================== */
    @keyframes ra-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }

    @keyframes ra-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }

    /* ===================== */
    /* Contenedor principal RA */
    /* ===================== */
    .ra-config-container {
      background: white;
      border-radius: 16px;
      padding: 2rem;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(2, 62, 138, 0.12);
      max-width: 100%;
    }

    .ra-config-title {
      color: var(--primary-color);
      font-size: 1.5rem;
      font-weight: 700;
      text-align: center;
      margin-bottom: 0.5rem;
    }

    .ra-config-subtitle {
      color: var(--secondary-color);
      text-align: center;
      font-size: 0.95rem;
      margin-bottom: 1.5rem;
    }

    /* ===================== */
    /* Tarjetas de etapa RA */
    /* ===================== */
    .ra-stage-list {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      max-height: 100%;
      overflow-y: auto;
      padding-right: 8px;
    }

    .ra-stage-card {
      border: 1px solid rgba(2, 62, 138, 0.15);
      border-radius: 14px;
      padding: 12px 14px;
      background: white;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
    }

    .ra-stage-card:hover {
      border-color: var(--primary-color);
      box-shadow: 0 6px 16px rgba(0, 119, 182, 0.12);
    }

    .ra-stage-card.is-active {
      border-color: var(--primary-color);
      box-shadow: 0 10px 24px rgba(0, 119, 182, 0.2);
      background: linear-gradient(160deg, rgba(0, 119, 182, 0.08), rgba(255, 255, 255, 0.95));
    }

    .ra-stage-toggle {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      font-weight: 600;
      color: var(--dark-color);
      cursor: pointer;
      user-select: none;
    }

    .ra-stage-toggle input {
      accent-color: var(--primary-color);
    }

    .ra-stage-body {
      margin-top: 0.75rem;
      padding-left: 0.5rem;
      display: grid;
      gap: 0.6rem;
    }

    .ra-field-label {
      font-weight: 600;
      font-size: 0.9rem;
      color: var(--dark-color);
    }

    .ra-field {
      width: 100%;
      padding: 0.65rem 0.75rem;
      border: 1px solid rgba(2, 62, 138, 0.2);
      border-radius: 8px;
      font-size: 0.95rem;
      font-family: var(--font-family, 'Poppins', sans-serif);
      background: #ffffff;
      color: var(--dark-color);
    }

    .ra-field:focus {
      outline: 2px solid rgba(0, 119, 182, 0.3);
      border-color: var(--primary-color);
    }

    .ra-field[type="file"] {
      padding: 0.4rem;
      cursor: pointer;
    }

    .ra-preview-btn {
      background-color: rgba(0, 119, 182, 0.1);
      color: var(--dark-color);
      border: 1px solid rgba(0, 119, 182, 0.3);
      font-weight: 600;
      padding: 0.65rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }

    .ra-preview-btn:hover {
      background-color: rgba(0, 119, 182, 0.18);
    }

    /* ===================== */
    /* Boton guardar RA */
    /* ===================== */
    .ra-save-btn {
      background-color: var(--primary-color);
      color: white;
      font-weight: 600;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 1rem;
      width: 100%;
      margin-top: 1rem;
      transition: background-color 0.3s ease;
    }

    .ra-save-btn:hover {
      background-color: #0056b3;
    }

    /* ===================== */
    /* Three.js wrap */
    /* ===================== */
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

    /* ===================== */
    /* AR Tabs y tarjetas */
    /* ===================== */
    .ar-tabs {
      display: flex;
      gap: 0;
      margin-bottom: 1.5rem;
      border-bottom: 2px solid #e9ecef;
    }

    .ar-tab {
      flex: 1;
      padding: 1rem 1.5rem;
      border: none;
      background: transparent;
      font-size: 1rem;
      font-weight: 600;
      color: var(--secondary-color);
      cursor: pointer;
      position: relative;
      transition: all 0.3s ease;
      font-family: var(--font-family, 'Poppins', sans-serif);
    }

    .ar-tab:hover {
      color: var(--primary-color);
      background: rgba(0, 123, 255, 0.05);
    }

    .ar-tab.active {
      color: var(--primary-color);
    }

    .ar-tab.active::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--primary-color);
      border-radius: 3px 3px 0 0;
    }

    .ar-tab.has-content .tab-indicator {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: var(--success-color);
      border-radius: 50%;
      margin-left: 8px;
      vertical-align: middle;
    }

    .ar-tab-content {
      padding: 1.5rem;
      background: #f8f9fa;
      border-radius: 12px;
      margin-bottom: 1.5rem;
      min-height: 300px;
    }

    .ar-tab-header {
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e9ecef;
    }

    .ar-stage-toggle {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 600;
      color: var(--dark-color);
      cursor: pointer;
    }

    .ar-stage-toggle input {
      width: 20px;
      height: 20px;
      accent-color: var(--primary-color);
      cursor: pointer;
    }

    .ar-content-cards {
      display: grid;
      width: 100%;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1rem;
    }

    .ar-content-card {
      width: 100%;
      background: white;
      border: 2px solid #e9ecef;
      border-radius: 12px;
      padding: 1rem;
      transition: all 0.3s ease;
    }

    .ar-content-card:hover {
      border-color: var(--primary-color);
      box-shadow: 0 4px 12px rgba(0, 123, 255, 0.1);
    }

    .ar-content-card.has-content {
      border-color: var(--success-color);
      background: linear-gradient(135deg, rgba(40, 167, 69, 0.05), white);
    }

    .ar-card-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #e9ecef;
    }

    .ar-card-icon {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--primary-color);
    }

    .ar-card-title {
      font-weight: 600;
      color: var(--dark-color);
      font-size: 1.05rem;
      flex: 1;
    }

    .ar-delete-btn {
      background: #ff4757;
      color: white;
      border: none;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s, transform 0.2s;
      padding: 0;
      line-height: 1;
    }

    .ar-delete-btn:hover {
      background: #ff6b7a;
      transform: scale(1.1);
    }

    .ar-card-body {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .ar-preview-image {
      max-width: 100%;
      max-height: 120px;
      object-fit: contain;
      border-radius: 8px;
      margin-top: 0.5rem;
    }

    .ar-preview-audio {
      width: 100%;
      margin-top: 0.5rem;
    }

    .ar-preview-video {
      width: 100%;
      max-height: 120px;
      border-radius: 8px;
      margin-top: 0.5rem;
    }

    .ar-disabled-message {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      color: var(--secondary-color);
      text-align: center;
    }

    .ar-disabled-message p {
      font-size: 1.05rem;
      margin: 0;
    }

    @media (max-width: 768px) {
      .ar-content-cards {
        grid-template-columns: 1fr;
      }
    }

    /* ===================== */
    /* Multi content layout for modals */
    /* ===================== */
    .ar-multi-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      width: 100%;
      margin: 0;
    }

    .ar-layout-single {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
    }

    .ar-layout-text-top {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      width: 100%;
    }

    .ar-layout-text-top .ar-row-text {
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .ar-layout-text-top .ar-row-media {
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .ar-layout-row {
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;
      gap: 1.5rem;
      width: 100%;
      flex-wrap: wrap;
    }

    .ar-layout-three {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      width: 100%;
    }

    .ar-layout-three .ar-row-text {
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .ar-layout-three .ar-row-media-pair {
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;
      gap: 1.5rem;
      width: 100%;
      flex-wrap: wrap;
    }

    .ar-multi-text-3d {
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .ar-multi-image,
    .ar-multi-video {
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 12px;
      overflow: hidden;
    }

    .ar-three-container {
      width: 300px;
      height: 200px;
      border-radius: 12px;
    }

    .ar-audio-solo {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 16px;
    }

    .ar-audio-icon {
      font-size: 3.5rem;
      animation: pulse-audio 1.5s ease-in-out infinite;
    }

    @keyframes pulse-audio {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.8; }
    }

    .ar-audio-solo .ar-audio-player {
      width: 280px;
      height: 40px;
    }

    .ar-audio-hidden {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .ar-audio-player-bg {
      width: 1px;
      height: 1px;
    }

    /* ===================== */
    /* Modal RA Background */
    /* ===================== */
    .blockly-ar-bg {
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

    .blockly-ar-bg-camera {
      background: transparent;
    }

    .blockly-ar-camera-bg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
      border-radius: 28px;
      background: none;
    }

    .blockly-ar-bg-elements {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(circle at 20% 20%, rgba(255,255,255,0.1) 0%, transparent 50%),
        radial-gradient(circle at 80% 80%, rgba(255,255,255,0.1) 0%, transparent 50%);
    }

    .blockly-ar-content {
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

    .blockly-ar-top {
      color: #ffd60a;
      font-weight: 800;
      text-shadow: 2px 2px 8px #3a0ca3, 0 0 20px rgba(0,0,0,0.8);
      text-align: center;
      background: rgba(0, 0, 0, 0.4);
      padding: 0.8rem 1.5rem;
      border-radius: 12px;
      backdrop-filter: blur(5px);
    }

    .blockly-ar-three-wrap {
      width: 100%;
      height: 240px;
      overflow: hidden;
      position: relative;
      z-index: 1;
    }

    /* ===================== */
    /* SweetAlert2 customizations */
    /* ===================== */
    .swal2-popup {
      border-radius: 28px !important;
      width: auto;
    }

    .swal2-title {
      font-family: 'Poppins', sans-serif !important;
    }

    .swal2-html-container {
      font-family: 'Poppins', sans-serif !important;
    }

    .swal2-confirm {
      background-color: #0077b6 !important;
      border-radius: 8px !important;
      font-weight: 600 !important;
      padding: 0.6rem 1.25rem !important;
    }

    .swal2-cancel {
      background-color: white !important;
      color: #0077b6 !important;
      border: 2px solid #0077b6 !important;
      border-radius: 8px !important;
      font-weight: 600 !important;
      padding: 0.6rem 1.25rem !important;
    }

    .swal2-cancel:hover {
      background-color: rgba(0, 123, 255, 0.05) !important;
    }

    /* ===================== */
    /* Boton editar RA */
    /* ===================== */
    .ra-edit-btn {
      background-color: rgba(0, 119, 182, 0.1);
      color: var(--dark-color);
      border: 1px solid rgba(0, 119, 182, 0.3);
      font-weight: 600;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }

    .ra-edit-btn:hover {
      background-color: rgba(0, 119, 182, 0.18);
    }
  `}</style>
);

// --- Título Animado ---
const GameTitle = () => (
  <h1 className="font-bold text-center blockly-title-animate" style={{ color: '#023e8a', textShadow: '0 3px 6px rgba(0, 119, 182, 0.4)' }}>
    Blockly
  </h1>
);

// --- Base de Datos de Desafíos ---
const ALL_CHALLENGES = [
  // --- Básico ---
  {
    id: 'b1',
    title: 'Suma de dos números',
    description: 'Crea una función que reciba dos números y devuelva su suma.',
    instructions: [
      'Arrastra el bloque de "función" para empezar.',
      'Añade dos argumentos (x, y) a tu función.',
      'Usa el bloque de "devolver" de la categoría "Funciones".',
      'Usa un bloque de "suma" de "Matemáticas" para sumar x e y.'
    ],
    testCases: [
      { input: [7, 2], expected: 9 },
      { input: [5, 0], expected: 5 },
      { input: [3, 1], expected: 4 },
    ],
    difficulty: 'Básico',
    functionName: 'sumar', // Nombre que debe tener la función
  },
  {
    id: 'b2',
    title: 'Resta de dos números',
    description: 'Crea una función que reciba dos números y devuelva su resta (el primero menos el segundo).',
    instructions: [
      'Define una función con dos argumentos (a, b).',
      'Devuelve el resultado de "a - b" usando los bloques de "Matemáticas".'
    ],
    testCases: [
      { input: [10, 2], expected: 8 },
      { input: [5, 5], expected: 0 },
      { input: [3, 5], expected: -2 },
    ],
    difficulty: 'Básico',
    functionName: 'restar',
  },
  {
    id: 'b3',
    title: '¿Es mayor que 10?',
    description: 'Crea una función que reciba un número y devuelva "verdadero" si es mayor que 10, y "falso" si no lo es.',
    instructions: [
      'Define una función con un argumento (num).',
      'Usa un bloque "si... entonces... si no..." de "Lógica".',
      'Usa un bloque de comparación de "Lógica" para ver si "num > 10".',
      'Devuelve los bloques "verdadero" o "falso" de "Lógica".'
    ],
    testCases: [
      { input: [11], expected: true },
      { input: [10], expected: false },
      { input: [9], expected: false },
      { input: [20], expected: true },
    ],
    difficulty: 'Básico',
    functionName: 'esMayorQueDiez',
  },
  {
    id: 'b4',
    title: 'Contador del 1 al 10',
    description: 'Crea una función que devuelva un array (lista) con los números del 1 al 10.',
    instructions: [
      'Define una función sin argumentos.',
      'Crea una variable "lista" y asígnale una "lista vacía" de "Listas".',
      'Usa un bucle "contar con..." de "Bucles" para contar de 1 a 10.',
      'Dentro del bucle, usa el bloque "en lista... añadir al final" de "Listas" para añadir la variable del bucle (i) a tu "lista".',
      'Al final, devuelve la "lista".'
    ],
    testCases: [
      { input: [], expected: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    ],
    difficulty: 'Básico',
    functionName: 'contarHastaDiez',
  },
  {
    id: 'b5',
    title: 'Mostrar mensaje',
    description: 'Crea una función que devuelva el texto "Hola Blockly".',
    instructions: [
      'Define una función sin argumentos.',
      'Usa el bloque "devolver" de "Funciones".',
      'Añade un bloque de "texto" de "Texto" con el valor "Hola Blockly".'
    ],
    testCases: [
      { input: [], expected: "Hola Blockly" },
    ],
    difficulty: 'Básico',
    functionName: 'mostrarMensaje',
  },
  // --- Intermedio ---
  {
    id: 'i1',
    title: 'Encontrar el número mayor',
    description: 'Crea una función que reciba dos números y devuelva el mayor de los dos.',
    instructions: [
      'Define una función con dos argumentos (a, b).',
      'Usa un bloque "si... entonces... si no...".',
      'Compara si "a > b".',
      'Si es verdad, devuelve "a".',
      'Si no, devuelve "b".'
    ],
    testCases: [
      { input: [5, 10], expected: 10 },
      { input: [10, 5], expected: 10 },
      { input: [7, 7], expected: 7 },
    ],
    difficulty: 'Intermedio',
    functionName: 'encontrarMayor',
  },
  {
    id: 'i2',
    title: 'Factorial de un número',
    description: 'Crea una función que calcule el factorial de un número. (Ej: 5! = 5*4*3*2*1 = 120).',
    instructions: [
      'Define una función con un argumento (n).',
      'Crea una variable "resultado" y ponla en 1.',
      'Usa un bucle "contar con..." de (i) desde 1 hasta (n).',
      'Dentro del bucle, "establece resultado" a "resultado * i".',
      'Al final, devuelve "resultado".'
    ],
    testCases: [
      { input: [5], expected: 120 },
      { input: [1], expected: 1 },
      { input: [0], expected: 1 }, // Por definición, 0! = 1
      { input: [3], expected: 6 },
    ],
    difficulty: 'Intermedio',
    functionName: 'factorial',
  },
  {
    id: 'i3',
    title: 'Invertir un texto',
    description: 'Crea una función que reciba un texto y lo devuelva al revés.',
    instructions: [
      'Este desafío es más complejo. Blockly no tiene un bloque "invertir texto".',
      'Intenta usar bucles para recorrer el texto desde el final hasta el principio.',
      'Crea una variable "textoInvertido" como "" (texto vacío).',
      'Usa un bucle "contar con..." (i) desde "longitud de texto" - 1 hasta 0, disminuyendo 1.',
      'Dentro del bucle, "establece textoInvertido" a "textoInvertido" + "en texto... obtener letra #" (i).',
      'Devuelve "textoInvertido".'
    ],
    testCases: [
      { input: ["hola"], expected: "aloh" },
      { input: ["React"], expected: "tcaeR" },
      { input: ["a"], expected: "a" },
    ],
    difficulty: 'Intermedio',
    functionName: 'invertirTexto',
  },
  {
    id: 'i4',
    title: 'Sumar una lista',
    description: 'Crea una función que reciba una lista de números y devuelva la suma de todos sus elementos.',
    instructions: [
      'Define una función con un argumento (lista).',
      'Crea una variable "total" y ponla en 0.',
      'Usa un bucle "para cada elemento (item) en lista..." de "Bucles".',
      'Dentro del bucle, "establece total" a "total + item".',
      'Al final, devuelve "total".'
    ],
    testCases: [
      { input: [[1, 2, 3]], expected: 6 },
      { input: [[10, 20]], expected: 30 },
      { input: [[]], expected: 0 },
    ],
    difficulty: 'Intermedio',
    functionName: 'sumarLista',
  },
  {
    id: 'i5',
    title: '¿Es Palíndromo?',
    description: 'Crea una función que reciba un texto y devuelva "verdadero" si se lee igual al derecho y al revés (ej: "ana"), y "falso" si no.',
    instructions: [
      'Este es un desafío de lógica.',
      'Puedes re-usar la lógica de "Invertir un texto".',
      'Obtén el texto invertido.',
      'Usa un bloque de "Lógica" para comparar si "texto" == "textoInvertido".',
      'Devuelve el resultado de esa comparación.'
    ],
    testCases: [
      { input: ["ana"], expected: true },
      { input: ["radar"], expected: true },
      { input: ["hola"], expected: false },
    ],
    difficulty: 'Intermedio',
    functionName: 'esPalindromo',
  },
   {
    id: 'i6',
    title: 'Contar Pares',
    description: 'Crea una función que reciba una lista de números y devuelva cuántos de ellos son pares.',
    instructions: [
        'Define una función con un argumento (lista).',
        'Crea una variable "contador" y ponla en 0.',
        'Usa un bucle "para cada elemento (num) en lista...".',
        'Dentro del bucle, usa un bloque "si..."',
        'La condición será "num % 2 == 0" (usa el bloque "resto de" de "Matemáticas").',
        'Si es verdad, "establece contador" a "contador + 1".',
        'Al final, devuelve "contador".'
    ],
    testCases: [
        { input: [[1, 2, 3, 4, 5, 6]], expected: 3 },
        { input: [[2, 4, 6, 8]], expected: 4 },
        { input: [[1, 3, 5]], expected: 0 },
    ],
    difficulty: 'Intermedio',
    functionName: 'contarPares',
  },
  // --- Avanzado ---
  {
    id: 'a1',
    title: 'Fibonacci',
    description: 'Crea una función que reciba un número (n) y devuelva el n-ésimo número de la secuencia de Fibonacci (0, 1, 1, 2, 3, 5, 8...).',
    instructions: [
      'Este es difícil. Si n=0, devuelve 0. Si n=1, devuelve 1.',
      'Crea una lista "fib" con [0, 1].',
      'Usa un bucle "contar con..." (i) desde 2 hasta (n).',
      'Dentro del bucle, añade a "fib" la suma de "elemento # (i-1) de fib" + "elemento # (i-2) de fib".',
      'Al final, devuelve el "elemento # (n) de fib".'
    ],
    testCases: [
      { input: [0], expected: 0 },
      { input: [1], expected: 1 },
      { input: [5], expected: 5 },
      { input: [7], expected: 13 },
    ],
    difficulty: 'Avanzado',
    functionName: 'fibonacci',
  },
  {
    id: 'a2',
    title: 'Encontrar el Máximo de una Lista',
    description: 'Crea una función que reciba una lista de números y devuelva el número más grande.',
    instructions: [
      'Define una función con (lista).',
      'Crea una variable "maximo" y establécela al "primer elemento" de la lista.',
      'Usa un bucle "para cada elemento (num) en lista...".',
      'Dentro, usa un "si..." para comparar si "num > maximo".',
      'Si es verdad, "establece maximo" a "num".',
      'Al final, devuelve "maximo".'
    ],
    testCases: [
      { input: [[1, 5, 2, 8, 3]], expected: 8 },
      { input: [[-10, -5, -2]], expected: -2 },
      { input: [[100]], expected: 100 },
    ],
    difficulty: 'Avanzado',
    functionName: 'encontrarMaximo',
  },
  {
    id: 'a3',
    title: '¿Es número primo?',
    description: 'Crea una función que reciba un número y devuelva "verdadero" si es primo, y "falso" si no lo es.',
    instructions: [
        'Un número primo solo es divisible por 1 y por sí mismo. 1 no es primo.',
        'Define una función con (num).',
        'Si "num <= 1", devuelve "falso".',
        'Usa un bucle "contar con..." (i) desde 2 hasta "num - 1".',
        'Dentro del bucle, usa un "si..."',
        'La condición será "num % i == 0" (resto de).',
        'Si es verdad, significa que es divisible, así que "devuelve falso".',
        'Si el bucle termina sin devolver falso, "devuelve verdadero" (fuera del bucle).'
    ],
    testCases: [
        { input: [2], expected: true },
        { input: [3], expected: true },
        { input: [4], expected: false },
        { input: [7], expected: true },
        { input: [10], expected: false },
        { input: [1], expected: false },
    ],
    difficulty: 'Avanzado',
    functionName: 'esPrimo',
  },
  {
    id: 'a4',
    title: 'Promedio de una Lista',
    description: 'Crea una función que reciba una lista de números y devuelva su promedio.',
    instructions: [
      'Puedes re-usar la lógica de "Sumar una lista".',
      'Calcula la suma total.',
      'Obtén la "longitud de" la lista.',
      'Devuelve "suma total / longitud".',
      'Considera el caso de una lista vacía (debería devolver 0).'
    ],
    testCases: [
      { input: [[1, 2, 3]], expected: 2 },
      { input: [[10, 20, 30]], expected: 20 },
      { input: [[5, 5, 5, 5]], expected: 5 },
    ],
    difficulty: 'Avanzado',
    functionName: 'promedio',
  },
  {
    id: 'a5',
    title: 'Eliminar Duplicados',
    description: 'Crea una función que reciba una lista y devuelva una nueva lista sin elementos duplicados.',
    instructions: [
      'Crea una variable "listaUnica" como una lista vacía.',
      'Usa un bucle "para cada elemento (item) en lista...".',
      'Dentro, usa un "si..."',
      'La condición será "en lista "listaUnica" encontrar "item" == -1" (usando "encontrar primera/última aparición" de "Listas").',
      'Si es verdad, "añade "item" a "listaUnica".',
      'Al final, devuelve "listaUnica".'
    ],
    testCases: [
      { input: [[1, 2, 2, 3, 1, 4]], expected: [1, 2, 3, 4] },
      { input: [["a", "b", "a"]], expected: ["a", "b"] },
      { input: [[1, 2, 3]], expected: [1, 2, 3] },
    ],
    difficulty: 'Avanzado',
    functionName: 'eliminarDuplicados',
  },
  {
    id: 'a6',
    title: 'Unir dos Listas',
    description: 'Crea una función que reciba dos listas y devuelva una sola lista con todos los elementos de ambas.',
    instructions: [
      'Blockly no tiene un bloque directo para "unir" listas.',
      'Crea una "nuevaLista" como una copia de "lista1".',
      'Usa un bucle "para cada elemento (item) en lista2...".',
      'Dentro, "añade "item" a "nuevaLista".',
      'Devuelve "nuevaLista".'
    ],
    testCases: [
      { input: [[1, 2], [3, 4]], expected: [1, 2, 3, 4] },
      { input: [[], [1, 2]], expected: [1, 2] },
      { input: [["a"], ["b"]], expected: ["a", "b"] },
    ],
    difficulty: 'Avanzado',
    functionName: 'unirListas',
  },
  {
    id: 'a7',
    title: 'Mayúsculas',
    description: 'Crea una función que reciba un texto y lo devuelva en mayúsculas.',
    instructions: [
      'Usa el bloque "a mayúsculas/minúsculas" de la categoría "Texto".',
      'Devuelve el resultado.'
    ],
    testCases: [
      { input: ["hola"], expected: "HOLA" },
      { input: ["Blockly"], expected: "BLOCKLY" },
      { input: ["Ya EsTa"], expected: "YA ESTA" },
    ],
    difficulty: 'Avanzado',
    functionName: 'aMayusculas',
  },
  {
    id: 'a8',
    title: 'FizzBuzz',
    description: 'Crea una función que reciba un número (n) y devuelva una lista de 1 a n, pero: si el número es divisible por 3, pon "Fizz"; si es divisible por 5, pon "Buzz"; si es divisible por ambos, pon "FizzBuzz"; si no, pon el número.',
    instructions: [
      'Este es un clásico. Crea una "listaResultado" vacía.',
      'Usa un bucle "contar con..." (i) de 1 a (n).',
      'Dentro, usa "si... si no si... si no si... si no".',
      '1. Si (i % 3 == 0) Y (i % 5 == 0) -> añade "FizzBuzz".',
      '2. Si (i % 3 == 0) -> añade "Fizz".',
      '3. Si (i % 5 == 0) -> añade "Buzz".',
      '4. Si no -> añade (i).',
      'Al final, devuelve "listaResultado".'
    ],
    testCases: [
      { input: [15], expected: [1, 2, "Fizz", 4, "Buzz", "Fizz", 7, 8, "Fizz", "Buzz", 11, "Fizz", 13, 14, "FizzBuzz"] },
    ],
    difficulty: 'Avanzado',
    functionName: 'fizzBuzz',
  },
];

// --- Configuración de Niveles ---
const DIFFICULTY_SETTINGS = {
  Básico: {
    maxChallenges: 3,
    time: 5 * 60, // 5 minutos
    availableChallenges: ALL_CHALLENGES.filter(c => c.difficulty === 'Básico').slice(0, 5)
  },
  Intermedio: {
    maxChallenges: 4,
    time: 10 * 60, // 10 minutos
    availableChallenges: ALL_CHALLENGES.filter(c => c.difficulty === 'Intermedio').slice(0, 6)
  },
  Avanzado: {
    maxChallenges: 5,
    time: 15 * 60, // 15 minutos
    availableChallenges: ALL_CHALLENGES.filter(c => c.difficulty === 'Avanzado').slice(0, 8)
  }
};

// --- Definición del Toolbox de Blockly ---
const toolboxXml = `
  <xml>
    <category name="Lógica" colour="#5C81A6">
      <block type="controls_if"></block>
      <block type="logic_compare"></block>
      <block type="logic_operation"></block>
      <block type="logic_negate"></block>
      <block type="logic_boolean"></block>
      <block type="logic_null"></block>
      <block type="logic_ternary"></block>
    </category>
    <category name="Bucles" colour="#5CA65C">
      <block type="controls_repeat_ext">
        <value name="TIMES">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
      </block>
      <block type="controls_whileUntil"></block>
      <block type="controls_for">
        <value name="FROM">
          <shadow type="math_number">
            <field name="NUM">1</field>
          </shadow>
        </value>
        <value name="TO">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
        <value name="BY">
          <shadow type="math_number">
            <field name="NUM">1</field>
          </shadow>
        </value>
      </block>
      <block type="controls_forEach"></block>
      <block type="controls_flow_statements"></block>
    </category>
    <category name="Matemáticas" colour="#5C68A6">
      <block type="math_number"></block>
      <block type="math_arithmetic">
        <value name="A">
          <shadow type="math_number">
            <field name="NUM">1</field>
          </shadow>
        </value>
        <value name="B">
          <shadow type="math_number">
            <field name="NUM">1</field>
          </shadow>
        </value>
      </block>
      <block type="math_single">
        <value name="NUM">
          <shadow type="math_number">
            <field name="NUM">9</field>
          </shadow>
        </value>
      </block>
      <block type="math_trig">
        <value name="NUM">
          <shadow type="math_number">
            <field name="NUM">45</field>
          </shadow>
        </value>
      </block>
      <block type="math_constant"></block>
      <block type="math_number_property">
        <value name="NUMBER_TO_CHECK">
          <shadow type="math_number">
            <field name="NUM">0</field>
          </shadow>
        </value>
      </block>
      <block type="math_round">
        <value name="NUM">
          <shadow type="math_number">
            <field name="NUM">3.1</field>
          </shadow>
        </value>
      </block>
      <block type="math_on_list"></block>
      <block type="math_modulo">
        <value name="DIVIDEND">
          <shadow type="math_number">
            <field name="NUM">64</field>
          </shadow>
        </value>
        <value name="DIVISOR">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
      </block>
      <block type="math_constrain">
        <value name="VALUE">
          <shadow type="math_number">
            <field name="NUM">50</field>
          </shadow>
        </value>
        <value name="LOW">
          <shadow type="math_number">
            <field name="NUM">1</field>
          </shadow>
        </value>
        <value name="HIGH">
          <shadow type="math_number">
            <field name="NUM">100</field>
          </shadow>
        </value>
      </block>
      <block type="math_random_int">
        <value name="FROM">
          <shadow type="math_number">
            <field name="NUM">1</field>
          </shadow>
        </value>
        <value name="TO">
          <shadow type="math_number">
            <field name="NUM">100</field>
          </shadow>
        </value>
      </block>
      <block type="math_random_float"></block>
    </category>
    <category name="Texto" colour="#A65C5C">
      <block type="text"></block>
      <block type="text_join"></block>
      <block type="text_append">
        <value name="TEXT">
          <shadow type="text"></shadow>
        </value>
      </block>
      <block type="text_length">
        <value name="VALUE">
          <shadow type="text">
            <field name="TEXT">abc</field>
          </shadow>
        </value>
      </block>
      <block type="text_isEmpty">
        <value name="VALUE">
          <shadow type="text">
            <field name="TEXT"></field>
          </shadow>
        </value>
      </block>
      <block type="text_indexOf">
        <value name="VALUE">
          <shadow type="text">
            <field name="TEXT">abc</field>
          </shadow>
        </value>
        <value name="FIND">
          <shadow type="text">
            <field name="TEXT">b</field>
          </shadow>
        </value>
      </block>
      <block type="text_charAt">
        <value name="VALUE">
          <shadow type="text">
            <field name="TEXT">abc</field>
          </shadow>
        </value>
      </block>
      <block type="text_getSubstring">
        <value name="STRING">
          <shadow type="text">
            <field name="TEXT">abc</field>
          </shadow>
        </value>
      </block>
      <block type="text_changeCase">
        <value name="TEXT">
          <shadow type="text">
            <field name="TEXT">abc</field>
          </shadow>
        </value>
      </block>
      <block type="text_trim">
        <value name="TEXT">
          <shadow type="text">
            <field name="TEXT"> abc </field>
          </shadow>
        </value>
      </block>
      <block type="text_print">
        <value name="TEXT">
          <shadow type="text">
            <field name="TEXT">abc</field>
          </shadow>
        </value>
      </block>
    </category>
    <category name="Listas" colour="#745CA6">
      <block type="lists_create_with">
        <mutation items="0"></mutation>
      </block>
      <block type="lists_create_with"></block>
      <block type="lists_repeat">
        <value name="NUM">
          <shadow type="math_number">
            <field name="NUM">5</field>
          </shadow>
        </value>
      </block>
      <block type="lists_length"></block>
      <block type="lists_isEmpty"></block>
      <block type="lists_indexOf">
        <value name="VALUE">
          <block type="variables_get">
            <field name="VAR">list</field>
          </block>
        </value>
      </block>
      <block type="lists_getIndex">
        <value name="VALUE">
          <block type="variables_get">
            <field name="VAR">list</field>
          </block>
        </value>
      </block>
      <block type="lists_setIndex">
        <value name="LIST">
          <block type="variables_get">
            <field name="VAR">list</field>
          </block>
        </value>
      </block>
      <block type="lists_getSublist">
        <value name="LIST">
          <block type="variables_get">
            <field name="VAR">list</field>
          </block>
        </value>
      </block>
      <block type="lists_split">
        <value name="DELIM">
          <shadow type="text">
            <field name="TEXT">,</field>
          </shadow>
        </value>
      </block>
      <block type="lists_sort"></block>
    </category>
    <sep></sep>
    <category name="Variables" colour="#A6745C" custom="VARIABLE"></category>
    <category name="Funciones" colour="#9A5CA6" custom="PROCEDURE"></category>
  </xml>
`;

// --- Componente: Pantalla de Configuración (SetupScreen) ---
const SetupScreen = ({ onGameStart, onEditAR }) => {
  const [difficulty, setDifficulty] = useState('Básico');
  const [selectedChallenges, setSelectedChallenges] = useState(new Set());
  const [settings, setSettings] = useState(DIFFICULTY_SETTINGS[difficulty]);

  useEffect(() => {
    setSettings(DIFFICULTY_SETTINGS[difficulty]);
    setSelectedChallenges(new Set()); // Resetear selección al cambiar dificultad
  }, [difficulty]);

  const toggleChallenge = (challengeId) => {
    setSelectedChallenges(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(challengeId)) {
        newSelection.delete(challengeId);
      } else {
        if (newSelection.size < settings.maxChallenges) {
          newSelection.add(challengeId);
        } else {
          // Opcional: Mostrar alerta si excede el máximo
          window.Swal.fire({
            title: 'Límite alcanzado',
            text: `Solo puedes seleccionar un máximo de ${settings.maxChallenges} desafíos para el nivel ${difficulty}.`,
            icon: 'warning',
            timer: 2000
          });
        }
      }
      return newSelection;
    });
  };

  const handleStart = () => {
    if (selectedChallenges.size === 0) {
       window.Swal.fire({
            title: 'Sin desafíos',
            text: `Debes seleccionar al menos un desafío para comenzar.`,
            icon: 'error',
            timer: 2000
          });
      return;
    }
    const challenges = settings.availableChallenges.filter(c => selectedChallenges.has(c.id));
    onGameStart(difficulty, challenges, settings.time);
  };

  const getButtonClass = (level) => {
    return level === difficulty
      ? 'text-white shadow-lg'
      : 'bg-white text-gray-700 border border-gray-300 hover:border-sky-600';
  };

  const selectedButtonStyle = { backgroundColor: '#023e8a' };
  
  const getChallengeCardClass = (id) => {
    return selectedChallenges.has(id)
      ? 'bg-blue-100 border-blue-500 border-2 shadow-inner'
      : 'bg-white border-gray-300 border hover:shadow-lg';
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8">
      {/* Botón Editar RA */}
      <div className="flex justify-end mb-4">
        <button
          onClick={onEditAR}
          className="ra-edit-btn"
        >
          Editar RA
        </button>
      </div>

      {/* 1. Selección de Dificultad */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Selecciona el nivel de dificultad:</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {['Básico', 'Intermedio', 'Avanzado'].map(level => (
            <button
              key={level}
              onClick={() => setDifficulty(level)}
              className={`py-3 px-6 rounded-full text-lg font-medium transition-all duration-200 ease-in-out transform hover:scale-105 sm:w-auto ${getButtonClass(level)}`}
              style={level === difficulty ? selectedButtonStyle : {}}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* 2. Lista de Desafíos */}
        <div className="w-full md:w-2/3">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Selecciona los desafíos a realizar (Máximo {settings.maxChallenges}):
          </h2>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-inner overflow-hidden">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 h-full overflow-y-auto">
              {settings.availableChallenges.map(challenge => (
                <div
                  key={challenge.id}
                  onClick={() => toggleChallenge(challenge.id)}
                  className={`p-2 rounded-lg cursor-pointer transition-all duration-200 transform hover:scale-105 flex items-center justify-center text-center font-semibold ${getChallengeCardClass(challenge.id)}`}
                >
                  {challenge.title}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Desafíos Seleccionados y Botón */}
        <div className="w-full md:w-1/3 flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Desafíos seleccionados: {selectedChallenges.size} / {settings.maxChallenges}</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-inner min-h-[200px]">
              {selectedChallenges.size === 0 && (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 0h-4m4 0l-5-5" />
                  </svg>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {settings.availableChallenges.filter(c => selectedChallenges.has(c.id)).map(c => (
                  <div key={c.id} className="p-3 rounded-lg text-white font-medium text-center shadow-md" style={{ backgroundColor: '#0077b6' }}>
                    {c.title}
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <button
            onClick={handleStart}
            disabled={selectedChallenges.size === 0}
            className="w-full bg-green-500 text-white font-bold py-4 px-6 rounded-lg text-xl shadow-lg mt-6 transition-all duration-200 hover:bg-green-600 transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Componente: Espacio de Trabajo de Blockly ---
const BlocklyWorkspace = ({ toolbox, onCodeUpdate }) => {
  const blocklyRef = useRef(null);
  const workspaceRef = useRef(null);

  // Inicializar el workspace de Blockly
  useEffect(() => {
    if (window.Blockly && blocklyRef.current && !workspaceRef.current) {
        // Asegurarse de que el idioma español está cargado
      window.Blockly.setLocale('es');
      
      workspaceRef.current = window.Blockly.inject(blocklyRef.current, {
        toolbox: toolbox,
        grid: {
          spacing: 20,
          length: 3,
          colour: '#ccc',
          snap: true,
        },
        trashcan: true,
        zoom: {
          controls: true,
          wheel: true,
          startScale: 1.0,
          maxScale: 3,
          minScale: 0.3,
          scaleSpeed: 1.2
        }
      });

      // Registrar el generador de código JavaScript
      if (window.Blockly.JavaScript) {
        // Listener para actualizar el código en cada cambio
        workspaceRef.current.addChangeListener(() => {
          const code = window.Blockly.JavaScript.workspaceToCode(workspaceRef.current);
          onCodeUpdate(code);
        });
      } else {
        console.error("Blockly JavaScript generator not loaded.");
      }
    }

    // Limpieza al desmontar
    return () => {
      // No destruir el workspace para evitar errores en re-renders rápidos
      // if (workspaceRef.current) {
      //   workspaceRef.current.dispose();
      //   workspaceRef.current = null;
      // }
    };
  }, [toolbox, onCodeUpdate]);
  
  // Redimensionar Blockly con la ventana
  useEffect(() => {
    const handleResize = () => {
      if (workspaceRef.current) {
        window.Blockly.svgResize(workspaceRef.current);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Llamada inicial
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <div ref={blocklyRef} className="blockly-workspace blockly-dotted-grid" />;
};


// --- Componente: Pantalla de Juego (GameScreen) ---
const GameScreen = ({ difficulty, challenges, totalTime, onGameEnd, arSelectedStages, arConfig, showARStageModal }) => {
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(totalTime);
  const [generatedCode, setGeneratedCode] = useState('');
  const [executionResult, setExecutionResult] = useState({ type: '', message: '' });
  const timerRef = useRef(null);

  const currentChallenge = challenges[currentChallengeIndex];

  // --- Funciones del Temporizador ---
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  const startTimer = () => {
    stopTimer(); // Asegurar que no haya múltiples temporizadores
    timerRef.current = setInterval(() => {
      setTimeLeft(prevTime => {
        if (prevTime <= 1) {
          stopTimer();
          handleTimeOut(); // handleTimeOut ya no necesita detener el timer
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);
  };

  // --- Lógica del Temporizador ---
  useEffect(() => {
    startTimer();
    return () => stopTimer(); // Limpieza al desmontar el componente
  }, []); // Se ejecuta solo una vez

  const handleTimeOut = () => {
    window.Swal.fire({
      title: '¡Puedes mejorar, Intenta nuevamente!',
      text: `Se acabó el tiempo. Total: ${score} Puntos`,
      icon: 'info',
      allowOutsideClick: false,
    }).then(() => {
      onGameEnd(score);
    });
  };

  // --- Finalizar Juego (Nuevo) ---
  const handleFinishGame = () => {
    stopTimer(); // Pausar el temporizador
    
    window.Swal.fire({
      title: '¿Estás seguro?',
      text: "Finalizarás el juego con tu puntuación actual.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33', // Rojo para confirmar
      cancelButtonColor: '#3085d6', // Azul para cancelar
      confirmButtonText: 'Sí, finalizar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        // El usuario confirmó, mostrar mensaje final y terminar
        window.Swal.fire({
          title: '¡Puedes mejorar, Intenta nuevamente!',
          text: `Total: ${score} Puntos`,
          icon: 'info',
          allowOutsideClick: false,
        }).then(() => {
          onGameEnd(score); // Enviar puntuación actual
        });
      } else {
        // El usuario canceló, reanudar el temporizador
        startTimer(); 
      }
    });
  };

  // --- Formatear Tiempo ---
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // --- Ejecutar Solución ---
  const executeSolution = () => {
    const { testCases, functionName } = currentChallenge;
    let allCorrect = true;
    let resultsLog = [];

    if (!generatedCode.includes(`function ${functionName}`)) {
         setExecutionResult({ 
           type: 'error', 
           message: `Error: Tu código debe definir una función llamada "${functionName}".`
         });
         showIncorrectModal();
         return;
    }

    try {
      // Crear la función en un scope controlado
      // AÃ±adimos "var" para asegurar que la funciÃ³n se defina en el scope de "new Function"
      const userFunction = new Function(`${generatedCode.replace(`function ${functionName}`, `var ${functionName} = function`)} return ${functionName};`)();

      for (const testCase of testCases) {
        const result = userFunction(...testCase.input);
        const expected = testCase.expected;
        
        // Comparación (simple, para arrays y primitivos)
        const isCorrect = JSON.stringify(result) === JSON.stringify(expected);

        if (!isCorrect) {
          allCorrect = false;
          resultsLog.push(`Falló: Entrada [${testCase.input.join(', ')}]. Esperado: ${JSON.stringify(expected)}, Recibido: ${JSON.stringify(result)}`);
          break; // Detenerse al primer error
        } else {
           resultsLog.push(`Éxito: Entrada [${testCase.input.join(', ')}]. Recibido: ${JSON.stringify(result)}`);
        }
      }

    } catch (error) {
      allCorrect = false;
      resultsLog.push(`Error de ejecución: ${error.message}`);
    }
    
    // Mostrar resultado
    setExecutionResult({ 
      type: allCorrect ? 'success' : 'error', 
      message: resultsLog.join('\n') 
    });
    
    if (allCorrect) {
        handleCorrectSolution();
    } else {
        showIncorrectModal();
    }
  };
  
  // --- Modales ---
  const showIncorrectModal = () => {
     window.Swal.fire({
        title: 'Solución incorrecta,',
        text: 'Intenta nuevamente',
        icon: 'error'
     });
  };
  
  const handleCorrectSolution = async () => {
    const newScore = score + 10;
    setScore(newScore);

    // Mostrar modal de RA si está configurado
    const hasARContent = arSelectedStages?.Acierto && arConfig?.Acierto;

    if (hasARContent) {
      const result = await showARStageModal('Acierto', {
        title: '¡Solución correcta!',
        icon: 'success',
        showCancelButton: currentChallengeIndex < challenges.length - 1,
        confirmButtonText: currentChallengeIndex < challenges.length - 1 ? 'Siguiente desafío' : 'Ver resultado',
        cancelButtonText: 'Finalizar juego',
        confirmButtonColor: '#0077b6',
      });

      if (!result && currentChallengeIndex < challenges.length - 1) {
        // Usuario canceló, finalizar juego
        stopTimer();
        window.Swal.fire({
          title: '¡Buen trabajo!',
          text: `Total: ${newScore} Puntos`,
          icon: 'info',
          allowOutsideClick: false,
          confirmButtonColor: '#0077b6',
        }).then(() => {
          onGameEnd(newScore);
        });
        return;
      }
    } else {
      // Sin RA, mostrar modal normal
      await window.Swal.fire({
        title: 'Solución correcta',
        html: '¡Has obtenido!<br><b class="text-2xl text-green-700">10 Puntos</b>',
        icon: 'success',
        allowOutsideClick: false,
        confirmButtonColor: '#0077b6',
      });
    }

    // Mover al siguiente desafío o finalizar
    if (currentChallengeIndex < challenges.length - 1) {
      setCurrentChallengeIndex(prev => prev + 1);
      setExecutionResult({ type: '', message: '' }); // Limpiar resultado
    } else {
      // Juego terminado
      stopTimer(); // Detener tiempo
      window.Swal.fire({
        title: '¡Felicidades, lo lograste!',
        text: `Total: ${newScore} Puntos`,
        icon: 'success',
        allowOutsideClick: false,
        confirmButtonColor: '#0077b6',
      }).then(() => {
        onGameEnd(newScore);
      });
    }
  };

  return (
    <div className="w-full h-full min-h-screen flex flex-col bg-gray-100">
      {/* 1. Header Bar */}
      <div className="w-full bg-white shadow-md p-2 flex flex-wrap justify-center md:justify-between items-center gap-2">
        <div className="flex gap-2">
           <span className="text-white text-lg font-semibold px-4 py-2 rounded-lg shadow-md" style={{ backgroundColor: '#0077b6' }}>
             Nivel: {difficulty}
           </span>
            <span className="text-white text-lg font-semibold px-4 py-2 rounded-lg shadow-md" style={{ backgroundColor: '#0077b6' }}>
             Tiempo: {formatTime(timeLeft)}
           </span>
        </div>
        <div className="flex gap-2 items-center">
           <span className="text-white text-lg font-semibold px-4 py-2 rounded-lg shadow-md" style={{ backgroundColor: '#0077b6' }}>
             Desafío: {currentChallengeIndex + 1} / {challenges.length}
           </span>
           <span className="text-white text-lg font-semibold px-4 py-2 rounded-lg shadow-md" style={{ backgroundColor: '#0077b6' }}>
             Puntuación: {score}
           </span>
           {/* --- Botón Finalizar (NUEVO) --- */}
           <button
             onClick={handleFinishGame}
             className="bg-red-500 text-white text-lg font-semibold px-4 py-2 rounded-lg shadow-md transition-colors duration-200 hover:bg-red-600"
             title="Finalizar el juego"
           >
             Finalizar
           </button>
        </div>
      </div>

      {/* 2. Game Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-2 p-2 h-full">
        
        {/* Panel Izquierdo: Desafío */}
        <div className="lg:col-span-1 bg-white rounded-lg shadow-lg p-4 overflow-y-auto max-h-[calc(100vh-80px)]">
          <h3 className="text-2xl font-bold text-gray-900 mb-3">{currentChallenge.title}</h3>
          <p className="text-gray-700 mb-4">{currentChallenge.description}</p>
          
          <h4 className="text-lg font-semibold text-gray-800 mb-2">Casos de prueba:</h4>
          <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm font-mono shadow-inner">
            {currentChallenge.testCases.map((tc, index) => (
              <div key={index} className="mb-2">
                <p className="text-gray-600">Entrada: [{tc.input.join(', ')}]</p>
                <p className="text-blue-800">Salida esperada: {JSON.stringify(tc.expected)}</p>
              </div>
            ))}
          </div>
          
           <h4 className="text-lg font-semibold text-gray-800 mb-2">Instrucciones:</h4>
           <ul className="list-decimal list-inside text-gray-700 space-y-1 text-sm">
             <li>Crea una función llamada <b>{currentChallenge.functionName}</b>.</li>
             {currentChallenge.instructions.map((inst, index) => (
                 <li key={index}>{inst}</li>
             ))}
             <li>Haz clic en "Ejecutar Solución" para probar tu código.</li>
           </ul>
        </div>

        {/* Panel Central: Blockly */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-lg overflow-hidden h-full">
          <BlocklyWorkspace 
            toolbox={toolboxXml} 
            onCodeUpdate={setGeneratedCode} 
          />
        </div>

        {/* Panel Derecho: Resultado */}
        <div className="lg:col-span-1 bg-white rounded-lg shadow-lg p-4 flex flex-col">
          <h3 className="text-2xl font-bold text-gray-900 mb-3">Resultado</h3>
          <button
            onClick={executeSolution}
            className="w-full bg-green-500 text-white font-bold py-3 px-6 rounded-lg text-lg shadow-lg transition-all duration-200 hover:bg-green-600 transform hover:scale-105"
          >
            Ejecutar Solución
          </button>
          <div className="flex-1 bg-gray-900 text-white font-mono text-sm rounded-lg p-4 mt-4 overflow-y-auto shadow-inner">
            <p className="text-gray-400 mb-2">&gt; Esperando ejecución...</p>
            {executionResult.message && (
                <pre className={executionResult.type === 'success' ? 'text-green-400' : 'text-red-400'}>
                    {executionResult.message}
                </pre>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};


// --- Componente Principal (App) ---
const BlocklyChallenge = () => {
  // Three.js loaders
  const { ensureThree, ensureThreeTextAddons } = useThreeLoaders();
  const initThreeStage = useMemo(
    () => initThreeStageFactory({ ensureThree, ensureThreeTextAddons }),
    [ensureThree, ensureThreeTextAddons]
  );

  // Estado del wizard: 'ar' -> 'setup' -> 'game'
  // Siempre empieza en 'ar' para configurar primero la RA
  const [setupStep, setSetupStep] = useState("ar");

  // Pestaña activa en la configuración de RA
  const [activeARTab, setActiveARTab] = useState(AR_STAGES[0] ?? "Acierto");

  // Estado RA (solo Acierto)
  const [arSelectedStages, setArSelectedStages] = useState(() =>
    readJSON(LS.arStages, { Acierto: false })
  );

  const [arConfig, setArConfig] = useState(() =>
    readJSON(LS.arConfig, { Acierto: {} })
  );

  // Referencias para ObjectURLs de medios
  const mediaObjectUrlsRef = useRef({});

  useEffect(() => {
    return () => {
      Object.values(mediaObjectUrlsRef.current).forEach((url) => {
        try { URL.revokeObjectURL(url); } catch {}
      });
      mediaObjectUrlsRef.current = {};
    };
  }, []);

  // Persistencia de RA
  useEffect(() => {
    writeJSON(LS.arStages, arSelectedStages);
  }, [arSelectedStages]);

  useEffect(() => {
    writeJSON(LS.arConfig, arConfig);
  }, [arConfig]);

  const [gameState, setGameState] = useState({
    screen: 'setup', // 'setup', 'game'
    difficulty: 'Básico',
    challenges: [],
    time: 0
  });
  // Estados de carga separados
  const [isSwalLoaded, setIsSwalLoaded] = useState(false);
  const [isBlocklyLoaded, setIsBlocklyLoaded] = useState(false);
  const [scriptsLoaded, setScriptsLoaded] = useState(false); // Este será 'true' cuando AMBOS estén listos

  // --- Handlers RA ---
  const toggleARStage = (stage) => {
    setArSelectedStages((prev) => ({ ...prev, [stage]: !prev[stage] }));
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
      try { URL.revokeObjectURL(prevUrl); } catch {}
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
      return { ok: false, msg: "Selecciona al menos la etapa Acierto de RA." };
    }

    for (const stage of enabledStages) {
      const cfg = arConfig?.[stage] ?? {};
      const hasText = !!cfg.text?.trim();
      const hasImage = !!cfg.imageUrl?.trim();
      const hasAudio = !!cfg.audioUrl?.trim();
      const hasVideo = !!cfg.videoUrl?.trim();

      if (!hasText && !hasImage && !hasAudio && !hasVideo) {
        return { ok: false, msg: `Agrega al menos un contenido para la etapa "${stage}".` };
      }
    }

    return { ok: true };
  };

  const escapeHtml = (s = "") =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const normalizeStageConfig = (stageCfg = {}) => {
    const text = stageCfg.text ?? "";
    const imageUrl = stageCfg.imageUrl ?? "";
    const audioUrl = stageCfg.audioUrl ?? "";
    const videoUrl = stageCfg.videoUrl ?? "";

    let detectedType = stageCfg.type;
    if (!detectedType) {
      if (videoUrl?.trim()) detectedType = "Video";
      else if (imageUrl?.trim()) detectedType = "Imagen";
      else if (audioUrl?.trim()) detectedType = "Audio";
      else if (text?.trim()) detectedType = "Texto";
    }

    return {
      type: detectedType,
      text,
      imageUrl,
      audioUrl,
      videoUrl,
      hasText: !!text?.trim(),
      hasImage: !!imageUrl?.trim(),
      hasAudio: !!audioUrl?.trim(),
      hasVideo: !!videoUrl?.trim(),
    };
  };

  const hasStageContent = (stageCfg = {}) => {
    const cfg = normalizeStageConfig(stageCfg);
    return !!(cfg.text?.trim() || cfg.imageUrl?.trim() || cfg.audioUrl?.trim() || cfg.videoUrl?.trim());
  };

  const buildMultiContentHtml = (stageCfg, ids) => {
    const cfg = normalizeStageConfig(stageCfg);

    const visualElements = [];
    if (cfg.hasText) visualElements.push("text");
    if (cfg.hasImage) visualElements.push("image");
    if (cfg.hasVideo) visualElements.push("video");

    const visualCount = visualElements.length;
    const isAudioOnly = cfg.hasAudio && visualCount === 0;

    const textHtml = cfg.hasText ? `
      <div class="ar-multi-text-3d">
        <div id="${ids.textContainerId}" class="ar-three-container"></div>
      </div>
    ` : "";

    const imageHtml = cfg.hasImage ? `
      <div class="ar-multi-image">
        <div id="${ids.imageContainerId}" class="ar-three-container"></div>
      </div>
    ` : "";

    const videoHtml = cfg.hasVideo ? `
      <div class="ar-multi-video">
        <div id="${ids.videoContainerId}" class="ar-three-container"></div>
      </div>
    ` : "";

    const audioHtml = cfg.hasAudio ? (
      isAudioOnly
        ? `<div class="ar-audio-solo">
            <div class="ar-audio-icon">&#9835;</div>
            <audio id="${ids.audioId || "ar-audio-player"}" controls src="${escapeHtml(cfg.audioUrl)}" class="ar-audio-player"></audio>
           </div>`
        : `<div class="ar-audio-hidden">
            <audio id="${ids.audioId || "ar-audio-player"}" autoplay src="${escapeHtml(cfg.audioUrl)}" class="ar-audio-player-bg"></audio>
           </div>`
    ) : "";

    if (visualCount === 1) {
      return `
        <div class="ar-layout-single">
          ${textHtml}${imageHtml}${videoHtml}
        </div>
        ${audioHtml}
      `;
    }

    if (isAudioOnly) {
      return `
        <div class="ar-layout-single">
          ${audioHtml}
        </div>
      `;
    }

    if (visualCount === 2) {
      if (cfg.hasText && cfg.hasImage) {
        return `
          <div class="ar-layout-text-top">
            <div class="ar-row-text">${textHtml}</div>
            <div class="ar-row-media">${imageHtml}</div>
          </div>
          ${audioHtml}
        `;
      }
      if (cfg.hasText && cfg.hasVideo) {
        return `
          <div class="ar-layout-text-top">
            <div class="ar-row-text">${textHtml}</div>
            <div class="ar-row-media">${videoHtml}</div>
          </div>
          ${audioHtml}
        `;
      }
      if (cfg.hasImage && cfg.hasVideo) {
        return `
          <div class="ar-layout-row">
            ${imageHtml}
            ${videoHtml}
          </div>
          ${audioHtml}
        `;
      }
    }

    if (visualCount === 3) {
      return `
        <div class="ar-layout-three">
          <div class="ar-row-text">${textHtml}</div>
          <div class="ar-row-media-pair">
            ${imageHtml}
            ${videoHtml}
          </div>
        </div>
        ${audioHtml}
      `;
    }

    return `${textHtml}${imageHtml}${videoHtml}${audioHtml}`;
  };

  const showARStageModal = async (stage, swalOverrides = {}) => {
    if (!arSelectedStages?.[stage]) return true;

    const stageCfg = arConfig?.[stage] ?? {};
    if (!hasStageContent(stageCfg)) return true;
    if (!window.Swal) return false;

    const cfg = normalizeStageConfig(stageCfg);
    const timestamp = Date.now();
    const bgId = `blockly-ar-bg-${stage}-${timestamp}`;
    const videoId = `blockly-ar-video-${stage}-${timestamp}`;
    const useCamera = stage === 'Acierto';

    const ids = {
      textContainerId: `ar-text-${timestamp}`,
      imageContainerId: `ar-image-${timestamp}`,
      videoContainerId: `ar-video-${timestamp}`,
      audioId: `ar-audio-${timestamp}`,
    };

    const cleanups = [];
    let cleanupSymbols;
    let cameraStream;

    const innerHtml = buildMultiContentHtml(stageCfg, ids);
    const html = buildDecoratedHtml({
      bgId,
      innerHtml: `<div class="ar-multi-content">${innerHtml}</div>`,
      useCamera,
      videoId,
    });

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

        if (cfg.hasText) {
          const container = document.getElementById(ids.textContainerId);
          if (container) cleanups.push(initThreeStage(container, { type: "Texto", text: cfg.text }));
        }
        if (cfg.hasImage) {
          const container = document.getElementById(ids.imageContainerId);
          if (container) cleanups.push(initThreeStage(container, { type: "Imagen", imageUrl: cfg.imageUrl }));
        }
        if (cfg.hasVideo) {
          const container = document.getElementById(ids.videoContainerId);
          if (container) cleanups.push(initThreeStage(container, { type: "Video", videoUrl: cfg.videoUrl }));
        }
      },
      willClose: () => {
        cleanups.forEach((cleanup) => cleanup && cleanup());
        if (cleanupSymbols) cleanupSymbols();
        if (cameraStream) stopCamera(cameraStream);
      },
      ...swalOverrides,
    });

    return !!res?.isConfirmed;
  };

  const buildARStageSummaryHtml = (stage, stageCfg, isEnabled) => {
    const statusText = isEnabled ? "Habilitada" : "Deshabilitada";
    let body = `<p class="ra-empty">No habilitada.</p>`;

    if (isEnabled) {
      const contents = [];

      if (stageCfg?.text?.trim()) {
        contents.push(`<div class="ra-content-item"><span class="ra-icon">TXT</span> Texto configurado</div>`);
      }
      if (stageCfg?.imageUrl?.trim()) {
        contents.push(`<div class="ra-content-item"><span class="ra-icon">IMG</span> Imagen configurada</div>`);
      }
      if (stageCfg?.audioUrl?.trim()) {
        contents.push(`<div class="ra-content-item"><span class="ra-icon">AUD</span> Audio configurado</div>`);
      }
      if (stageCfg?.videoUrl?.trim()) {
        contents.push(`<div class="ra-content-item"><span class="ra-icon">VID</span> Video configurado</div>`);
      }

      body = contents.length > 0
        ? contents.join("")
        : `<p class="ra-empty">Sin contenido configurado.</p>`;
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
        .ra-content-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(2, 62, 138, 0.1); }
        .ra-content-item:last-child { border-bottom: none; }
        .ra-icon { font-size: 0.85rem; font-weight: 700; color: #023e8a; }
      </style>
      <div class="ra-summary">${cards}</div>
    `;
  };

  const showARConfigSummaryModal = async () => {
    if (!window.Swal) return true;

    const html = buildARConfigSummaryHtml();
    const res = await window.Swal.fire({
      title: "Configuración RA",
      html,
      width: 500,
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
      if (window.Swal) {
        await window.Swal.fire("Atención", v.msg, "warning");
      } else {
        alert(v.msg);
      }
      return;
    }

    writeJSON(LS.arStages, arSelectedStages);
    writeJSON(LS.arConfig, arConfig);

    const shouldContinue = await showARConfigSummaryModal();
    if (shouldContinue) {
      setSetupStep("setup");
    }
  };

  const handleGameStart = (difficulty, challenges, time) => {
    setGameState({
      screen: 'game',
      difficulty,
      challenges,
      time
    });
  };

  const handleGameEnd = (finalScore) => {
    // Volver a la pantalla de configuración
    setGameState({
      screen: 'setup',
      difficulty: 'Básico',
      challenges: [],
      time: 0
    });
  };

  // Callbacks para los loaders
  const onSwalLoaded = useCallback(() => setIsSwalLoaded(true), []);
  const onBlocklyLoaded = useCallback(() => setIsBlocklyLoaded(true), []);

  // Efecto para unificar las cargas
  useEffect(() => {
    if (isSwalLoaded && isBlocklyLoaded) {
      setScriptsLoaded(true);
    }
  }, [isSwalLoaded, isBlocklyLoaded]);

  // --- Renderizado de configuración RA ---
  const renderARConfig = () => (
    <div className="w-full max-w-2xl mx-auto p-4 md:p-8">
      <div className="ra-config-container">
        <h2 className="ra-config-title">Configuracion de Realidad Aumentada</h2>
        <p className="ra-config-subtitle">
          Configura el contenido que se mostrara cuando el jugador acierte un desafio.
        </p>

        <div className="ar-tabs">
          {AR_STAGES.map((stage) => (
            <button
              key={stage}
              className={`ar-tab ${activeARTab === stage ? "active" : ""} ${arSelectedStages?.[stage] ? "has-content" : ""}`}
              onClick={() => setActiveARTab(stage)}
            >
              {stage}
              {arSelectedStages?.[stage] && <span className="tab-indicator"></span>}
            </button>
          ))}
        </div>

        <div className="ar-tab-content">
          <div className="ar-tab-header">
            <label className="ar-stage-toggle">
              <input
                type="checkbox"
                checked={!!arSelectedStages?.[activeARTab]}
                onChange={() => toggleARStage(activeARTab)}
              />
              <span>Habilitar etapa "{activeARTab}"</span>
            </label>
          </div>

          {arSelectedStages?.[activeARTab] ? (
            <div className="ar-content-cards">
              <div className={`ar-content-card ${arConfig?.[activeARTab]?.text?.trim() ? "has-content" : ""}`}>
                <div className="ar-card-header">
                  <span className="ar-card-icon">TXT</span>
                  <span className="ar-card-title">Texto</span>
                  {arConfig?.[activeARTab]?.text?.trim() && (
                    <button
                      className="ar-delete-btn"
                      onClick={() => setARStageField(activeARTab, "text", "")}
                      title="Eliminar texto"
                    >
                      x
                    </button>
                  )}
                </div>
                <div className="ar-card-body">
                  <textarea
                    className="ra-field"
                    value={arConfig?.[activeARTab]?.text ?? ""}
                    onChange={(e) => setARStageField(activeARTab, "text", e.target.value)}
                    rows={3}
                    placeholder="Escribe el mensaje de texto..."
                  />
                </div>
              </div>

              <div className={`ar-content-card ${arConfig?.[activeARTab]?.imageUrl?.trim() ? "has-content" : ""}`}>
                <div className="ar-card-header">
                  <span className="ar-card-icon">IMG</span>
                  <span className="ar-card-title">Imagen</span>
                  {arConfig?.[activeARTab]?.imageUrl?.trim() && (
                    <button
                      className="ar-delete-btn"
                      onClick={() => handleARStageFileChange(activeARTab, "imageUrl", null)}
                      title="Eliminar imagen"
                    >
                      x
                    </button>
                  )}
                </div>
                <div className="ar-card-body">
                  <input
                    className="ra-field"
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      handleARStageFileChange(
                        activeARTab,
                        "imageUrl",
                        e.target.files?.[0] ?? null
                      )
                    }
                  />
                  {arConfig?.[activeARTab]?.imageUrl && (
                    <img
                      src={arConfig[activeARTab].imageUrl}
                      alt="Preview"
                      className="ar-preview-image"
                    />
                  )}
                </div>
              </div>

              <div className={`ar-content-card ${arConfig?.[activeARTab]?.audioUrl?.trim() ? "has-content" : ""}`}>
                <div className="ar-card-header">
                  <span className="ar-card-icon">AUD</span>
                  <span className="ar-card-title">Audio</span>
                  {arConfig?.[activeARTab]?.audioUrl?.trim() && (
                    <button
                      className="ar-delete-btn"
                      onClick={() => handleARStageFileChange(activeARTab, "audioUrl", null)}
                      title="Eliminar audio"
                    >
                      x
                    </button>
                  )}
                </div>
                <div className="ar-card-body">
                  <input
                    className="ra-field"
                    type="file"
                    accept="audio/*"
                    onChange={(e) =>
                      handleARStageFileChange(
                        activeARTab,
                        "audioUrl",
                        e.target.files?.[0] ?? null
                      )
                    }
                  />
                  {arConfig?.[activeARTab]?.audioUrl && (
                    <audio
                      controls
                      src={arConfig[activeARTab].audioUrl}
                      className="ar-preview-audio"
                    />
                  )}
                </div>
              </div>

              <div className={`ar-content-card ${arConfig?.[activeARTab]?.videoUrl?.trim() ? "has-content" : ""}`}>
                <div className="ar-card-header">
                  <span className="ar-card-icon">VID</span>
                  <span className="ar-card-title">Video</span>
                  {arConfig?.[activeARTab]?.videoUrl?.trim() && (
                    <button
                      className="ar-delete-btn"
                      onClick={() => handleARStageFileChange(activeARTab, "videoUrl", null)}
                      title="Eliminar video"
                    >
                      x
                    </button>
                  )}
                </div>
                <div className="ar-card-body">
                  <input
                    className="ra-field"
                    type="file"
                    accept="video/*"
                    onChange={(e) =>
                      handleARStageFileChange(
                        activeARTab,
                        "videoUrl",
                        e.target.files?.[0] ?? null
                      )
                    }
                  />
                  {arConfig?.[activeARTab]?.videoUrl && (
                    <video
                      controls
                      src={arConfig[activeARTab].videoUrl}
                      className="ar-preview-video"
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="ar-disabled-message">
              <p>Habilita esta etapa para configurar el contenido de Realidad Aumentada.</p>
            </div>
          )}
        </div>

        <button
          className="ra-save-btn"
          onClick={saveARConfigAndContinue}
        >
          Guardar y continuar
        </button>
      </div>
    </div>
  );

  return (
    <div className="blockly-scope font-sans bg-gray-50 min-h-screen">
      <SweetAlertLoader onLoaded={onSwalLoaded} />
      <BlocklyLoader onLoaded={onBlocklyLoaded} />
      <TailwindStyles />
      <BlocklyARStyles />

      <GameTitle />

      {!scriptsLoaded && (
         <div className="text-center p-10">
            <h2 className="text-2xl font-semibold text-gray-700">Cargando bibliotecas...</h2>
            <p className="text-gray-500 mt-2">
              {isBlocklyLoaded ? '✅ Blockly' : 'Cargando Blockly...'}
            </p>
            <p className="text-gray-500 mt-1">
              {isSwalLoaded ? '✅ SweetAlert2' : 'Cargando SweetAlert2...'}
            </p>
         </div>
      )}

      {scriptsLoaded && setupStep === 'ar' && renderARConfig()}

      {scriptsLoaded && setupStep === 'setup' && gameState.screen === 'setup' && (
        <SetupScreen
          onGameStart={handleGameStart}
          onEditAR={() => setSetupStep('ar')}
        />
      )}

      {scriptsLoaded && gameState.screen === 'game' && (
        <GameScreen
          difficulty={gameState.difficulty}
          challenges={gameState.challenges}
          totalTime={gameState.time}
          onGameEnd={handleGameEnd}
          arSelectedStages={arSelectedStages}
          arConfig={arConfig}
          showARStageModal={showARStageModal}
        />
      )}
    </div>
  );
};

export default BlocklyChallenge;
