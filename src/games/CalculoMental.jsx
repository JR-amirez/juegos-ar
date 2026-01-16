import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GrLinkNext } from "react-icons/gr";

// --- DATOS DE EJERCICIOS (Integrados en el archivo) ---
const exerciseData = [
    {
        "nivel": "basico",
        "operation": "3,+2,-1,+4,-2",
        "options": [
            { "text": "6", "isCorrect": true },
            { "text": "5", "isCorrect": false },
            { "text": "7", "isCorrect": false }
        ]
    },
    {
        "nivel": "basico",
        "operation": "5,+3,-2,+1,-4",
        "options": [
            { "text": "3", "isCorrect": true },
            { "text": "2", "isCorrect": false },
            { "text": "4", "isCorrect": false }
        ]
    },
    {
        "nivel": "basico",
        "operation": "7,-2,+5,-3,+1",
        "options": [
            { "text": "8", "isCorrect": true },
            { "text": "7", "isCorrect": false },
            { "text": "9", "isCorrect": false }
        ]
    },
    {
        "nivel": "intermedio",
        "operation": "20,÷2,+5,-3,+4,-2,+6,-1,+3,-4",
        "options": [
            { "text": "23", "isCorrect": true },
            { "text": "21", "isCorrect": false },
            { "text": "25", "isCorrect": false }
        ]
    },
    {
        "nivel": "intermedio",
        "operation": "15,÷3,+9,-4,+6,-2,+5,-3,+4,-1",
        "options": [
            { "text": "26", "isCorrect": true },
            { "text": "24", "isCorrect": false },
            { "text": "28", "isCorrect": false }
        ]
    },
    {
        "nivel": "avanzado",
        "operation": "8,×2,+5,-3,÷2,+4,×3,-2,+6,÷2,+7,-5,×2,+1,-4",
        "options": [
            { "text": "38", "isCorrect": true },
            { "text": "40", "isCorrect": false },
            { "text": "36", "isCorrect": false }
        ]
    },
    {
        "nivel": "avanzado",
        "operation": "12,×3,-6,÷2,+8,×2,-4,+7,÷2,+5,-3,×2,+6,-2,+4",
        "options": [
            { "text": "53", "isCorrect": true },
            { "text": "51", "isCorrect": false },
            { "text": "55", "isCorrect": false }
        ]
    }
];

// --- CONFIGURACIÓN RA (namespaced) ---
const STORAGE_NS = "cm"; // Calculadora Mental (namespace)
const lsKey = (k) => `${STORAGE_NS}:${k}`;

const LS_KEYS = {
    arSelectedStages: lsKey("ar_selected_stages"),
    arConfig: lsKey("ar_config"),
    gameConfig: lsKey("game_config"),
};

const AR_STAGES = ["Inicio", "Acierto", "Final"];
const AR_TYPES = ["Texto", "Texto3D", "Imagen", "Audio", "Video"];

const DEFAULT_AR_STAGES = { Inicio: false, Acierto: false, Final: false };

const loadJSON = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const escapeHtml = (s = "") =>
    String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");


const IconArrowBack = () => (
    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>
        <path d="M249.38 256L370.06 135.32a16.79 16.79 0 10-23.74-23.74L213.78 244.14a16.8 16.8 0 000 23.74l132.54 132.54a16.79 16.79 0 0023.74-23.74z"></path>
    </svg>
);
const IconConfigure = () => (
    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 16 16" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>
        <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311a1.464 1.464 0 0 1-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c-1.4-.413-1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.858 2.929 2.929 0 0 1 0 5.858z"></path>
    </svg>
);

const CalculoMental = () => {

    // Dentro del componente
    const STORAGE_NS = 'ar:calculoMental';
    const LS = {
        stages: `${STORAGE_NS}:selectedStages`,
        config: `${STORAGE_NS}:config`,
    };

    // Helper: lee JSON con fallback a claves antiguas (para no romper lo ya guardado)
    const readJson = (key, legacyKey, fallback) => {
        try {
            const raw = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
            return raw ? (JSON.parse(raw) ?? fallback) : fallback;
        } catch {
            return fallback;
        }
    };

    // --- WIZARD: 1) RA -> 2) Juego -> 3) Preview ---
    const [setupStep, setSetupStep] = useState("ar");

    // Pestaña activa en la configuración de RA
    const [activeARTab, setActiveARTab] = useState("Inicio");

    const [arSelectedStages, setArSelectedStages] = useState(() =>
        readJson(LS.stages, 'selectedStages', { Inicio: false, Acierto: false, Final: false })
    );

    // Nueva estructura: cada etapa puede tener los 4 tipos de contenido
    const [arConfig, setArConfig] = useState(() =>
        readJson(LS.config, 'gameConfig', {})
    );

    const threeLoadRef = useRef(null);
    const threeAddonsLoadRef = useRef(null);
    const mediaObjectUrlsRef = useRef({});

    useEffect(() => {
        return () => {
            Object.values(mediaObjectUrlsRef.current).forEach((url) => {
                if (url) URL.revokeObjectURL(url);
            });
        };
    }, []);

    const ensureSwal = () => {
        if (!window.Swal) {
            alert("SweetAlert2 aún no ha cargado. Intenta de nuevo en 1-2 segundos.");
            return false;
        }
        return true;
    };

    const ensureThree = () => {
        // 1) Si ya existe en global, reutilízalo
        if (window.THREE) return Promise.resolve(window.THREE);
        if (threeLoadRef.current) return threeLoadRef.current;

        // 2) Preferimos ES Modules (necesario para addons como FontLoader/TextGeometry)
        threeLoadRef.current = import("https://esm.sh/three@0.160.1")
            .then((mod) => {
                // `import()` regresa un namespace de módulo (no extensible). Lo copiamos a un objeto “normal”.
                const THREE = { ...mod };
                window.THREE = THREE;
                return THREE;
            })
            .catch(() => {
                // 3) Fallback legacy (no recomendado a largo plazo)
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
        // Carga FontLoader y TextGeometry (addons) desde CDN (ESM)
        if (threeAddonsLoadRef.current) return threeAddonsLoadRef.current;

        threeAddonsLoadRef.current = ensureThree().then(async (THREE) => {
            const [{ FontLoader }, { TextGeometry }] = await Promise.all([
                import("https://esm.sh/three@0.160.1/addons/loaders/FontLoader.js"),
                import("https://esm.sh/three@0.160.1/addons/geometries/TextGeometry.js"),
            ]);

            return { THREE, FontLoader, TextGeometry };
        });

        return threeAddonsLoadRef.current;
    };

    // 1) Etapas de RA
    const AR_STAGES = ['Inicio', 'Acierto', 'Final'];

    const toggleStage = (stage) => {
        setArSelectedStages(prev => ({ ...prev, [stage]: !prev[stage] }));
    };

    const updateStageValue = (stage, key, value) => {
        setArConfig(prev => ({
            ...prev,
            [stage]: {
                ...(prev[stage] ?? {}),
                [key]: value,
            }
        }));
    };

    const escapeHtml = (s = '') =>
        s.replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');

    const normalizeStageConfig = (stageCfg = {}) => {
        const legacyType = stageCfg.Texto
            ? "Texto"
            : stageCfg.Imagen
                ? "Imagen"
                : stageCfg.Audio
                    ? "Audio"
                    : stageCfg.Video
                        ? "Video"
                        : undefined;

        return {
            type: stageCfg.type ?? legacyType,
            text: stageCfg.text ?? stageCfg.TextoValor ?? "",
            imageUrl: stageCfg.imageUrl ?? stageCfg.ImagenUrl ?? "",
            audioUrl: stageCfg.audioUrl ?? stageCfg.AudioUrl ?? "",
            videoUrl: stageCfg.videoUrl ?? stageCfg.VideoUrl ?? "",
        };
    };

    const hasStageContent = (stageCfg = {}) => {
        const cfg = normalizeStageConfig(stageCfg);
        // Ahora verifica si hay al menos un tipo de contenido
        return !!(cfg.text?.trim() || cfg.imageUrl?.trim() || cfg.audioUrl?.trim() || cfg.videoUrl?.trim());
    };

    // Símbolos matemáticos (igual que script.js)
    const CM_MATH_SYMBOLS = ['×', '+', '÷', '-', '=', '1', '2', '3'];

    // Crea símbolos flotantes dentro de un contenedor (y regresa cleanup para evitar fugas)
    const cmCreateFloatingSymbols = (container) => {
        if (!container) return () => { };

        const uid = `cm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const createdNodes = [];
        const createdStyles = [];

        CM_MATH_SYMBOLS.forEach((symbol, index) => {
            const floating = document.createElement("div");
            floating.textContent = symbol;

            // Randoms (como en script.js)
            const size = Math.random() * 30 + 20;     // 20–50px
            const duration = Math.random() * 5 + 5;   // 5–10s
            const left = Math.random() * 80 + 10;     // 10–90%
            const top = Math.random() * 80 + 10;      // 10–90%
            const dx = Math.random() * 30 - 15;       // -15..15px
            const dy = Math.random() * 30 - 15;       // -15..15px
            const rot = Math.random() * 30 - 15;      // -15..15deg

            const animName = `cmFloat_${uid}_${index}`;

            // Estilos del símbolo (posición absoluta y animación)
            floating.style.cssText = `
                position: absolute;
                color: rgba(255, 255, 255, 0.2);
                font-size: ${size}px;
                animation: ${animName} ${duration}s ease-in-out infinite;
                left: ${left}%;
                top: ${top}%;
            `;

            // Keyframes únicos para evitar colisiones entre modales
            const keyframes = document.createElement("style");
            keyframes.textContent = `
                @keyframes ${animName} {
                    0%, 100% { transform: translate(0, 0) rotate(0deg); }
                    50% { transform: translate(${dx}px, ${dy}px) rotate(${rot}deg); }
                }
            `;

            document.head.appendChild(keyframes);
            container.appendChild(floating);

            createdStyles.push(keyframes);
            createdNodes.push(floating);
        });

        // Limpieza: elimina símbolos y keyframes al cerrar el modal
        return () => {
            createdNodes.forEach((n) => n.remove());
            createdStyles.forEach((s) => s.remove());
        };
    };

    // Función para iniciar la cámara en el fondo
    const startCamera = async (videoElementId) => {
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
    };

    // Función para detener la cámara
    const stopCamera = (stream) => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };

    // Genera el HTML del "fondo RA" (el canvas va adentro)
    const cmBuildARDecoratedHtml = ({ bgId, topHtml = "", innerHtml = "", useCamera = false, videoId = "" }) => `
        <div class="cm-ar-bg ${useCamera ? 'cm-ar-bg-camera' : ''}">
            ${useCamera ? `<video id="${videoId}" class="cm-ar-camera-bg" autoplay playsinline muted></video>` : ''}
            <div id="${bgId}" class="cm-ar-bg-elements"></div>

            <div class="cm-ar-content">
            ${topHtml}
            ${innerHtml}
            </div>
        </div>
    `;


    const initThreeStage = (container, stageCfg = {}) => {
        let disposed = false;
        let renderer;
        let scene;
        let camera;
        let frameId;
        let resizeObserver;
        let resizeHandler;
        let videoEl;
        let videoMetadataHandler;
        let toggleHandler;
        let audioObj;
        let audioAnalyser;
        let noteGroup;
        let notePulse = 0;
        let portalGroup;
        let portalFrameGroup;
        let portalGlow;
        let portalParticles;
        let portalParticleMeta;
        let enableRootSpin = true;
        let planeBaseSize = 1.8;

        const cleanup = () => {
            disposed = true;
            if (frameId) cancelAnimationFrame(frameId);
            if (resizeObserver) resizeObserver.disconnect();
            if (resizeHandler) window.removeEventListener("resize", resizeHandler);
            if (toggleHandler && container) container.removeEventListener("click", toggleHandler);
            if (videoEl) {
                if (videoMetadataHandler) {
                    videoEl.removeEventListener("loadedmetadata", videoMetadataHandler);
                }
                videoEl.pause();
                videoEl.src = "";
                videoEl.load();
            }
            if (audioObj && audioObj.isPlaying) audioObj.stop();
            if (scene) {
                scene.traverse((obj) => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                        materials.forEach((mat) => {
                            if (mat.map) mat.map.dispose();
                            mat.dispose();
                        });
                    }
                });
            }
            if (renderer) {
                renderer.dispose();
                if (renderer.domElement?.parentNode) {
                    renderer.domElement.parentNode.removeChild(renderer.domElement);
                }
            }
        };

        ensureThree()
            .then((THREE) => {
                if (disposed || !container) return;

                const cfg = normalizeStageConfig(stageCfg);
                if (!cfg.type) {
                    container.textContent = "Sin tipo configurado.";
                    return;
                }
                enableRootSpin = cfg.type !== "Video";
                if (cfg.type === "Video") {
                    planeBaseSize = 4;
                }

                const width = container.clientWidth || 360;
                const height = container.clientHeight || 240;

                scene = new THREE.Scene();
                camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
                camera.position.z = 3.2;

                renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
                renderer.setSize(width, height);
                renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                renderer.outputColorSpace = THREE.SRGBColorSpace;

                container.innerHTML = "";
                container.appendChild(renderer.domElement);

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

                const fitPlaneToAspect = (aspect, baseSize = planeBaseSize) => {
                    if (!aspect) return;
                    if (aspect >= 1) {
                        const width = baseSize;
                        const height = baseSize / aspect;
                        plane.scale.set(width, height, 1);
                        planeBack.scale.set(width, height, 1);
                        if (portalGlow) portalGlow.scale.set(width * 1.3, height * 1.3, 1);
                        updatePortalFrame(width, height);
                    } else {
                        const width = baseSize * aspect;
                        const height = baseSize;
                        plane.scale.set(width, height, 1);
                        planeBack.scale.set(width, height, 1);
                        if (portalGlow) portalGlow.scale.set(width * 1.3, height * 1.3, 1);
                        updatePortalFrame(width, height);
                    }
                };

                const createTextTexture = (text) => {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return null;

                    const lines = String(text).split(/\r?\n/);
                    const fontSize = 48;
                    const lineHeight = Math.round(fontSize * 1.2);
                    const padding = 28;
                    ctx.font = `${fontSize}px Arial`;
                    const maxWidth = Math.max(
                        ...lines.map((line) => ctx.measureText(line).width),
                        1
                    );
                    canvas.width = Math.min(Math.max(maxWidth + padding * 2, 256), 1024);
                    canvas.height = Math.min(lines.length * lineHeight + padding * 2, 1024);
                    ctx.fillStyle = "rgba(255,255,255,0.9)";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = "#0b2a4a";
                    ctx.textBaseline = "top";
                    ctx.font = `${fontSize}px Arial`;
                    lines.forEach((line, index) => {
                        ctx.fillText(line, padding, padding + index * lineHeight);
                    });
                    const texture = new THREE.CanvasTexture(canvas);
                    texture.colorSpace = THREE.SRGBColorSpace;
                    return texture;
                };

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

                if (cfg.type === "Texto" || cfg.type === "Texto3D") {
                    // Texto con volumen (TextGeometry). El plano solo se usa como fallback 2D.
                    plane.visible = false;
                    planeBack.visible = false;

                    // Iluminacion basica para que el volumen se lea.
                    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
                    scene.add(ambient);
                    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
                    dir.position.set(2, 3, 4);
                    scene.add(dir);

                    ensureThreeTextAddons()
                        .then(({ FontLoader, TextGeometry }) => {
                            if (disposed) return;

                            const loader = new FontLoader();
                            const fontUrl = "/fonts/helvetiker_regular.typeface.json";
                            const fallbackFontUrl =
                                "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/fonts/helvetiker_regular.typeface.json";

                            const buildTextMeshes = (font) => {
                                const textGroup = new THREE.Group();
                                root.add(textGroup);

                                const size = 0.35;
                                const depth = 0.1;
                                const lineHeight = size * 1.35;
                                const material = new THREE.MeshStandardMaterial({
                                    color: 0xffffff,
                                    roughness: 0.1,
                                    metalness: 0.0,
                                    emissive: 0xffffff,
                                    emissiveIntensity: 0.2,
                                });

                                const lines = String(cfg.text || "").split(/\r?\n/);
                                const widths = [];

                                lines.forEach((line, index) => {
                                    const geometry = new TextGeometry(line || " ", {
                                        font,
                                        size,
                                        height: depth,
                                        curveSegments: 12,
                                        bevelEnabled: true,
                                        bevelThickness: 0.01,
                                        bevelSize: 0.008,
                                        bevelSegments: 3,
                                    });
                                    geometry.computeBoundingBox();

                                    const box = geometry.boundingBox;
                                    const width = box ? box.max.x - box.min.x : 1;
                                    widths.push(width);

                                    const mesh = new THREE.Mesh(geometry, material);
                                    mesh.position.x = -width / 2;
                                    mesh.position.y = ((lines.length - 1) / 2 - index) * lineHeight;
                                    textGroup.add(mesh);
                                });

                                const maxWidth = Math.max(...widths, 1);
                                const targetWidth = 1.6;
                                const scale = maxWidth > 0 ? Math.min(1, targetWidth / maxWidth) : 1;
                                textGroup.scale.setScalar(scale);
                            };

                            loader.load(
                                fontUrl,
                                (font) => {
                                    if (disposed) return;
                                    buildTextMeshes(font);
                                },
                                undefined,
                                () => {
                                    loader.load(
                                        fallbackFontUrl,
                                        (font) => {
                                            if (disposed) return;
                                            buildTextMeshes(font);
                                        },
                                        undefined,
                                        () => {
                                            if (!disposed) {
                                                plane.visible = true;
                                                const texture = createTextTexture(cfg.text || "");
                                                if (texture) {
                                                    plane.material.map = texture;
                                                    plane.material.needsUpdate = true;
                                                    fitPlaneToAspect(texture.image.width / texture.image.height);
                                                }
                                            }
                                        }
                                    );
                                }
                            );
                        })
                        .catch(() => {
                            if (!disposed) {
                                plane.visible = true;
                                const texture = createTextTexture(cfg.text || "");
                                if (texture) {
                                    plane.material.map = texture;
                                    plane.material.needsUpdate = true;
                                    fitPlaneToAspect(texture.image.width / texture.image.height);
                                }
                            }
                        });
                } else if (cfg.type === "Imagen") {
                    const loader = new THREE.TextureLoader();
                    loader.setCrossOrigin("anonymous");
                    loader.load(
                        cfg.imageUrl || "",
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
                            if (!disposed) container.textContent = "No se pudo cargar la imagen.";
                        }
                    );
                } else if (cfg.type === "Video") {
                    videoEl = document.createElement("video");
                    videoEl.src = cfg.videoUrl || "";
                    videoEl.crossOrigin = "anonymous";
                    videoEl.loop = true;
                    videoEl.muted = true;
                    videoEl.playsInline = true;
                    videoEl.preload = "auto";
                    const texture = new THREE.VideoTexture(videoEl);
                    texture.colorSpace = THREE.SRGBColorSpace;
                    planeBack.visible = false;
                    plane.material = new THREE.MeshBasicMaterial({
                        map: texture,
                        transparent: true,
                        opacity: 0.96,
                    });
                    plane.material.needsUpdate = true;

                    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
                    scene.add(ambient);
                    const rim = new THREE.PointLight(0x7ffcff, 1.1);
                    rim.position.set(2.5, 2.2, 3.5);
                    scene.add(rim);

                    portalGroup = new THREE.Group();
                    if (plane.parent) plane.parent.remove(plane);
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
                        color: 0x7df9ff,
                        size: 0.05,
                        transparent: true,
                        opacity: 0.8,
                        depthWrite: false,
                        blending: THREE.AdditiveBlending,
                    });
                    portalParticles = new THREE.Points(particleGeo, particleMat);
                    portalGroup.add(portalParticles);

                    root.add(portalGroup);
                    fitPlaneToAspect(16 / 9);

                    videoMetadataHandler = () => {
                        if (videoEl.videoWidth && videoEl.videoHeight) {
                            fitPlaneToAspect(videoEl.videoWidth / videoEl.videoHeight);
                        }
                    };
                    videoEl.addEventListener("loadedmetadata", videoMetadataHandler);
                    videoEl.play().catch(() => { });
                    toggleHandler = () => {
                        if (videoEl.paused) {
                            videoEl.muted = false;
                            videoEl.play().catch(() => { });
                        }
                        else videoEl.pause();
                    };
                    container.addEventListener("click", toggleHandler);
                } else if (cfg.type === "Audio") {
                    plane.visible = false;
                    planeBack.visible = false;

                    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
                    scene.add(ambient);
                    const point = new THREE.PointLight(0xffffff, 1.4);
                    point.position.set(2, 3, 4);
                    scene.add(point);

                    const noteMaterial = new THREE.MeshStandardMaterial({
                        color: 0xffd166,
                        emissive: 0xffb703,
                        emissiveIntensity: 0.5,
                        roughness: 0.2,
                        metalness: 0.1,
                    });

                    const note = new THREE.Group();
                    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), noteMaterial);
                    
                    head.position.set(-0.15, -0.1, 0);
                    note.add(head);

                    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 12), noteMaterial);
                    stem.position.set(0.1, 0.35, 0);
                    note.add(stem);

                    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.08), noteMaterial);
                    flag.position.set(0.35, 0.68, 0);
                    flag.rotation.z = -0.35;
                    note.add(flag);

                    noteGroup = note;
                    root.add(noteGroup);

                    const listener = new THREE.AudioListener();
                    camera.add(listener);
                    const audio = new THREE.Audio(listener);
                    audioObj = audio;
                    const loader = new THREE.AudioLoader();
                    loader.setCrossOrigin("anonymous");
                    loader.load(
                        cfg.audioUrl || "",
                        (buffer) => {
                            if (disposed) return;
                            audio.setBuffer(buffer);
                            audio.setLoop(true);
                            audio.setVolume(0.6);
                            audioAnalyser = new THREE.AudioAnalyser(audio, 128);
                            audio.play().catch(() => { });
                        },
                        undefined,
                        () => {
                            if (!disposed) container.textContent = "No se pudo cargar el audio.";
                        }
                    );

                    toggleHandler = () => {
                        if (!audio.buffer) return;
                        if (audio.isPlaying) audio.pause();
                        else audio.play().catch(() => { });
                    };
                    container.addEventListener("click", toggleHandler);
                }

                const resize = () => {
                    if (!renderer || !camera || !container) return;
                    const nextWidth = container.clientWidth || 360;
                    const nextHeight = container.clientHeight || 240;
                    renderer.setSize(nextWidth, nextHeight);
                    camera.aspect = nextWidth / nextHeight;
                    camera.updateProjectionMatrix();
                };

                if (window.ResizeObserver) {
                    resizeObserver = new ResizeObserver(resize);
                    resizeObserver.observe(container);
                } else {
                    resizeHandler = () => resize();
                    window.addEventListener("resize", resizeHandler);
                }

                const animate = () => {
                    if (disposed) return;
                    if (enableRootSpin) {
                        root.rotation.y += 0.01;
                    }
                    if (portalGroup) {
                        const now = performance.now();
                        const floatY = Math.sin(now * 0.0011) * 0.06;
                        const floatX = Math.cos(now * 0.0009) * 0.02;
                        portalGroup.position.y = floatY;
                        portalGroup.position.x = floatX;
                        portalGroup.rotation.z = Math.sin(now * 0.0006) * 0.04;
                        portalGroup.rotation.y = Math.cos(now * 0.0005) * 0.04;
                    }
                    if (portalParticles) {
                        portalParticles.rotation.z += 0.002;
                        portalParticles.rotation.y += 0.001;
                    }
                    if (noteGroup && audioAnalyser) {
                        const raw = audioAnalyser.getAverageFrequency() / 255;
                        notePulse += (raw - notePulse) * 0.15;
                        const scale = 1 + notePulse * 0.5;
                        noteGroup.scale.setScalar(scale);
                        noteGroup.position.y = notePulse * 0.35;
                    }
                    frameId = requestAnimationFrame(animate);
                    renderer.render(scene, camera);
                };
                animate();
            })
            .catch(() => {
                if (container) {
                    container.innerHTML = buildStageHtml(stageCfg);
                }
            });

        return cleanup;
    };

    const buildStageHtml = (stageCfg = {}) => {
        const blocks = [];
        const type = stageCfg.type;

        if ((type === "Texto" || type === "Texto3D") && stageCfg.text?.trim()) {
            blocks.push(`<p style="margin:0 0 12px 0; white-space:pre-wrap;">${escapeHtml(stageCfg.text.trim())}</p>`);
        }

        if (type === "Imagen" && stageCfg.imageUrl?.trim()) {
            const url = escapeHtml(stageCfg.imageUrl.trim());
            blocks.push(`<img src="${url}" alt="RA Imagen" style="max-width:100%; border-radius:12px; display:block; margin:8px auto;" />`);
        }

        if (type === "Audio" && stageCfg.audioUrl?.trim()) {
            const url = escapeHtml(stageCfg.audioUrl.trim());
            blocks.push(`<audio controls style="width:100%; margin-top:8px;"><source src="${url}"></audio>`);
        }

        if (type === "Video" && stageCfg.videoUrl?.trim()) {
            const url = escapeHtml(stageCfg.videoUrl.trim());
            blocks.push(`<video controls style="width:100%; border-radius:12px; margin-top:8px;"><source src="${url}"></video>`);
        }

        if (blocks.length > 0) return blocks.join('');

        // Fallback a claves antiguas
        if (stageCfg.Texto && stageCfg.TextoValor?.trim()) {
            blocks.push(`<p style="margin:0 0 12px 0; white-space:pre-wrap;">${escapeHtml(stageCfg.TextoValor.trim())}</p>`);
        }

        if (stageCfg.Imagen && stageCfg.ImagenUrl?.trim()) {
            const url = escapeHtml(stageCfg.ImagenUrl.trim());
            blocks.push(`<img src="${url}" alt="RA Imagen" style="max-width:100%; border-radius:12px; display:block; margin:8px auto;" />`);
        }

        if (stageCfg.Audio && stageCfg.AudioUrl?.trim()) {
            const url = escapeHtml(stageCfg.AudioUrl.trim());
            blocks.push(`<audio controls style="width:100%; margin-top:8px;"><source src="${url}"></audio>`);
        }

        if (stageCfg.Video && stageCfg.VideoUrl?.trim()) {
            const url = escapeHtml(stageCfg.VideoUrl.trim());
            blocks.push(`<video controls style="width:100%; border-radius:12px; margin-top:8px;"><source src="${url}"></video>`);
        }

        return blocks.join('');
    };

    const showARStageModal = async (stage, swalOverrides = {}) => {
        // 1) Solo si la etapa está seleccionada
        if (!arSelectedStages?.[stage]) return true;

        // 2) Solo si hay contenido real
        const stageCfg = arConfig?.[stage] ?? {};
        if (!hasStageContent(stageCfg)) return true;
        if (!ensureSwal()) return false;

        const containerId = `ra-three-${stage}-${Date.now()}`;
        const bgId = `cm-ar-bg-${stage}-${Date.now()}`;

        let cleanup;
        let cleanupThree;
        let cleanupSymbols;

        const html = cmBuildARDecoratedHtml({
            bgId,
            innerHtml: `<div class="cm-ar-three-wrap"><div id="${containerId}" class="ra-three-canvas"></div></div>`,
        });

        // 3) Modal tipo script.js (overlay)
        const res = await window.Swal?.fire({
            html,
            confirmButtonText: "Continuar",
            confirmButtonColor: '#0077b6',
            didOpen: () => {
                const bgEl = document.getElementById(bgId);
                cleanupSymbols = cmCreateFloatingSymbols(bgEl);

                const container = document.getElementById(containerId);
                if (container) cleanupThree = initThreeStage(container, stageCfg);
            },
            willClose: () => {
                if (cleanupThree) cleanupThree();
                if (cleanupSymbols) cleanupSymbols();
            },
            ...swalOverrides,
        });

        return !!res?.isConfirmed;
    };


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
            URL.revokeObjectURL(prevUrl);
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

        // Verificar que cada etapa habilitada tenga al menos un contenido
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

    const buildARStageSummaryHtml = (stage, stageCfg, isEnabled) => {
        const statusText = isEnabled ? "Habilitada" : "Deshabilitada";
        let body = `<p class="ra-empty">No habilitada.</p>`;

        if (isEnabled) {
            const contents = [];

            // Verificar cada tipo de contenido
            if (stageCfg?.text?.trim()) {
                contents.push(`<div class="ra-content-item"><span class="ra-icon">📝</span> Texto configurado</div>`);
            }
            if (stageCfg?.imageUrl?.trim()) {
                contents.push(`<div class="ra-content-item"><span class="ra-icon">🖼️</span> Imagen configurada</div>`);
            }
            if (stageCfg?.audioUrl?.trim()) {
                contents.push(`<div class="ra-content-item"><span class="ra-icon">🎵</span> Audio configurado</div>`);
            }
            if (stageCfg?.videoUrl?.trim()) {
                contents.push(`<div class="ra-content-item"><span class="ra-icon">🎬</span> Video configurado</div>`);
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
        .ra-icon { font-size: 1.1rem; }
      </style>
      <div class="ra-summary">${cards}</div>
    `;
    };

    const showARConfigSummaryModal = async () => {
        if (!ensureSwal()) return true;

        const html = buildARConfigSummaryHtml();
        const res = await window.Swal.fire({
            title: "Configuracion RA",
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
        const validation = validateARConfig();
        if (!validation.ok) {
            if (ensureSwal()) {
                await window.Swal.fire("Atención", validation.msg, "warning");
            } else {
                alert(validation.msg);
            }
            return;
        }

        localStorage.setItem(LS.stages, JSON.stringify(arSelectedStages));
        localStorage.setItem(LS.config, JSON.stringify(arConfig));

        const shouldContinue = await showARConfigSummaryModal();
        if (shouldContinue) {
            setSetupStep("game");
        }
    };

    // --- ESTADOS DEL COMPONENTE ---
    const [gameState, setGameState] = useState('config'); // config, welcome, playing, answering, finished, summary
    const [config, setConfig] = useState({ level: 'basico', exerciseCount: 1 });
    const [gameData, setGameData] = useState({ exercises: [], currentStep: 0, score: 0 });
    const [operationText, setOperationText] = useState('');
    const [shuffledOptions, setShuffledOptions] = useState([]);
    const [selectedOption, setSelectedOption] = useState(null);
    const [availableCount, setAvailableCount] = useState(0);
    const navigate = useNavigate();
    const location = useLocation();

    const levels = [...new Set(exerciseData.map(ej => ej.nivel))];

    // --- EFECTOS ---
    useEffect(() => {
        // FIX: Cargar dinámicamente el script de SweetAlert2 para asegurar que las modales funcionen.
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/sweetalert2@11";
        script.async = true;
        document.body.appendChild(script);

        return () => {
            // Limpiar el script al desmontar el componente para evitar fugas de memoria.
            if (document.body.contains(script)) {
                document.body.removeChild(script);
            }
        };
    }, []); // El array vacío asegura que este efecto se ejecute solo una vez.

    useEffect(() => {
        const filtered = exerciseData.filter(ej => ej.nivel === config.level);
        setAvailableCount(filtered.length);
        if (config.exerciseCount > filtered.length) {
            setConfig(prev => ({ ...prev, exerciseCount: filtered.length || 1 }));
        }
    }, [config.level]);

    const goToSummary = () => {
        if (!ensureSwal()) return;

        if (setupStep === "ar") {
            window.Swal.fire("Atención", "Primero completa la Configuración de RA.", "warning");
            return;
        }

        // Persistencia namespaced del juego también
        localStorage.setItem(LS_KEYS.gameConfig, JSON.stringify(config));

        setGameState("summary");
        navigate("/settings?view=summary", {
            replace: true,
            state: {
                ...location.state,
                gameType: "calculoMental",
                gameConfig: {
                    level: config.level,
                    exerciseCount: config.exerciseCount,
                },
                // Extra (por si Summary lo quiere mostrar o guardar):
                arNamespace: STORAGE_NS,
                arSelectedStages,
                arConfig,
            },
        });
    };

    const returnToConfig = () => {
        setGameState('config');
        setSetupStep('game');
    };

    // --- LÓGICA DEL JUEGO ---

    const handleShowPreview = () => {
        // Guarda la configuración del juego (namespaced)
        localStorage.setItem(LS_KEYS.gameConfig, JSON.stringify(config));

        setGameState("welcome");
        setSetupStep("preview");
    };


    const handleStartGame = async () => {
        // Borrar datos de realidad aumentada al iniciar el juego
        localStorage.removeItem(LS_KEYS.arSelectedStages);
        localStorage.removeItem(LS_KEYS.arConfig);
        localStorage.removeItem(LS.stages);
        localStorage.removeItem(LS.config);
        setArSelectedStages({ Inicio: false, Acierto: false, Final: false });
        setArConfig({});

        // Muestra RA Inicio antes de comenzar (si existe)
        const ok = await showARStageModal('Inicio', {
            confirmButtonText: 'Comenzar',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#0077b6',
        });
        if (!ok) return; // si cancela, no inicia

        const filteredExercises = exerciseData.filter(ej => ej.nivel === config.level);
        const selectedExercises = filteredExercises.sort(() => Math.random() - 0.5).slice(0, config.exerciseCount);

        if (selectedExercises.length > 0) {
            setGameData({ exercises: selectedExercises, currentStep: 0, score: 0 });
            displayAROperation(0, selectedExercises);
        } else {
            window.Swal?.fire('Error', 'No hay ejercicios disponibles para este nivel.', 'error');
            setGameState('config');
        }
    };


    const displayAROperation = (step, exercises) => {
        setGameState('playing');
        setSelectedOption(null);
        setShuffledOptions([]);
        setOperationText('');

        const currentExercise = exercises[step];
        const operationString = currentExercise.operation.replace(/,/g, '');
        const parts = operationString.match(/(\d+|[+\-×÷*/])/g) || [];
        let i = 0;

        const interval = setInterval(() => {
            if (i < parts.length) {
                setOperationText(parts[i]);
                i++;
            } else {
                clearInterval(interval);
                setOperationText('¿Listo? ¡Puedes responder!');
                setShuffledOptions([...currentExercise.options].sort(() => Math.random() - 0.5));
                setGameState('answering');
            }
        }, 800); // Tiempo de visualización de cada número
    };

    const handleValidate = async () => {
        if (!selectedOption) {
            if (ensureSwal()) {
                window.Swal.fire('Atencion', 'Por favor, selecciona una opcion.', 'warning');
            } else {
                alert('Por favor, selecciona una opcion.');
            }
            return;
        }

        const isCorrect = selectedOption.isCorrect;
        // Logica de puntuacion: 10 puntos por respuesta correcta.
        const newScore = isCorrect ? gameData.score + 10 : gameData.score;
        setGameData(prev => ({ ...prev, score: newScore }));

        const isLastQuestion = gameData.currentStep === gameData.exercises.length - 1;

        if (isCorrect) {
            if (!ensureSwal()) return;
            const stageCfg = arConfig?.Acierto ?? {};
            const hasAR = hasStageContent(stageCfg);
            const containerId = hasAR ? `ra-three-acierto-${Date.now()}` : null;
            let cleanup;
            let cleanupSymbols;
            let cameraStream;
            const bgId = `cm-ar-bg-acierto-${Date.now()}`;
            const videoId = `cm-ar-video-acierto-${Date.now()}`;
            const html = cmBuildARDecoratedHtml({
                bgId,
                topHtml: `<div class="cm-ar-top" style="font-size:1.5rem;">10 Puntos</div>`,
                innerHtml: `<div class="cm-ar-three-wrap"><div id="${containerId}" class="ra-three-canvas"></div></div>`,
                useCamera: true,
                videoId: videoId,
            });

            const result = await window.Swal.fire({
                title: 'Correcto!',
                html,
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: isLastQuestion ? 'Ver Resultado' : 'Siguiente juego',
                cancelButtonText: 'Finalizar juego',
                confirmButtonColor: '#0077b6',
                didOpen: async () => {
                    cameraStream = await startCamera(videoId);

                    const bgEl = document.getElementById(bgId);
                    cleanupSymbols = cmCreateFloatingSymbols(bgEl);

                    const container = document.getElementById(containerId);
                    if (container) cleanup = initThreeStage(container, stageCfg);
                },
                willClose: () => {
                    if (cleanup) cleanup();
                    if (cleanupSymbols) cleanupSymbols();
                    if (cameraStream) stopCamera(cameraStream);
                },
            });

            if (result?.isConfirmed) handleNextStep();
            else handleBackToGenerator();
        }
        else {
            if (!ensureSwal()) return;
            const result = await window.Swal.fire({
                title: 'Error!',
                text: 'Intenta nuevamente.',
                icon: 'error',
                showCancelButton: true,
                confirmButtonText: 'Reiniciar juego',
                cancelButtonText: 'Finalizar juego',
                confirmButtonColor: '#0077b6',
            });
            if (result?.isConfirmed) {
                handleBackToGenerator(true); // Reinicia
            } else {
                handleBackToGenerator(); // Finaliza
            }
        }
    };

    const handleNextStep = async () => {
        const nextStep = gameData.currentStep + 1;
        if (nextStep < gameData.exercises.length) {
            setGameData(prev => ({ ...prev, currentStep: nextStep }));
            displayAROperation(nextStep, gameData.exercises);
        } else {
            setGameState('finished');

            if (!ensureSwal()) return;
            const stageCfg = arConfig?.Final ?? {};
            const hasAR = hasStageContent(stageCfg);
            const containerId = hasAR ? `ra-three-final-${Date.now()}` : null;
            const bgId = `cm-ar-bg-final-${Date.now()}`;
            let cleanupThree;
            let cleanupSymbols;

            const html = cmBuildARDecoratedHtml({
                bgId,
                topHtml: `<div class="cm-ar-top" style="font-size:1.5rem;">Puntuación Final: ${gameData.score + (selectedOption.isCorrect ? 10 : 0)}</div>`,
                innerHtml: hasAR ? `<div class="cm-ar-three-wrap"><div id="${containerId}" class="ra-three-canvas"></div></div>` : '',
            });

            const result = await window.Swal.fire({
                title: 'Juego Completado',
                html,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Terminar Configuracion',
                cancelButtonText: 'Volver a Jugar',
                confirmButtonColor: '#0077b6',
                didOpen: () => {
                    const bgEl = document.getElementById(bgId);
                    cleanupSymbols = cmCreateFloatingSymbols(bgEl);

                    if (!hasAR) return;
                    const container = document.getElementById(containerId);
                    if (container) cleanupThree = initThreeStage(container, stageCfg);
                },
                willClose: () => {
                    if (cleanupThree) cleanupThree();
                    if (cleanupSymbols) cleanupSymbols();
                },
            });

            if (result?.isConfirmed) goToSummary();
            else handleBackToGenerator(true);
        }
    };

    const handleBackToGenerator = (restart = false) => {
        setGameState(restart ? 'welcome' : 'config');
        setOperationText('');
        setSelectedOption(null);
        setGameData({ exercises: [], currentStep: 0, score: 0 });
        if (restart) {
            handleStartGame();
        }
    };

    // --- RENDERIZADO DE VISTAS ---

    const renderPreviewArea = () => {
        switch (gameState) {
            case 'welcome':
                return (
                    <div className="game-container welcome">
                        <h2>Bienvenido al juego de Cálculo Mental</h2>
                        <p>Observa como se juega</p>
                        <button className="game-btn primary" onClick={handleStartGame}>Iniciar juego</button>
                    </div>
                );
            case 'playing':
                return (
                    <div className="game-container playing">
                        <div className="operation-display">{operationText}</div>
                        <div className="score">Puntuación: {gameData.score}</div>
                    </div>
                );
            case 'answering':
                return (
                    <div className="game-container answering">
                        <div className="operation-display">{operationText}</div>
                        <div className="options-grid">
                            {shuffledOptions.map((option, index) => (
                                <button
                                    key={index}
                                    className={`option-btn ${selectedOption === option ? 'selected' : ''}`}
                                    onClick={() => setSelectedOption(option)}
                                >
                                    {option.text}
                                </button>
                            ))}
                        </div>
                        <button className="game-btn success" onClick={handleValidate} disabled={!selectedOption}>Validar Resultado</button>
                        <div className="score">Puntuación: {gameData.score}</div>
                    </div>
                );

            case 'config':
            default:
                return <div className="game-container placeholder">Selecciona tus opciones y presiona "Vista Previa" para comenzar.</div>;
        }
    };

    const AnimatedTitle = () => (
        <div className="animated-title-container">
            <h1 className="animated-title">
                {'Cálculo Mental'.split('').map((char, index) => (
                    <span key={index} style={{ animationDelay: `${index * 0.07}s` }}>
                        {char === ' ' ? '\u00A0' : char}
                    </span>
                ))}
            </h1>
            <div className="floating-icons">
                <span className="icon-1">+</span>
                <span className="icon-2">×</span>
                <span className="icon-3">-</span>
                <span className="icon-4">÷</span>
            </div>
        </div>
    );

    // Si estamos en el estado 'summary', renderizar solo el componente Summary
    if (gameState === 'summary') {
        return (
            <>
                {/* <Summary
                        config={{
                            level: config.level,
                            exerciseCount: config.exerciseCount,
                        }}
                        onBack={returnToConfig}
                    />
                */}
            </>

        );
    }

    return (
        <>
            {/* --- ESTILOS CSS (Integrados) --- */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
                
                :root {
                    --primary-color: #007bff;
                    --secondary-color: #6c757d;
                    --success-color: #28a745;
                    --danger-color: #dc3545;
                    --light-color: #f8f9fa;
                    --dark-color: #343a40;
                    --bg-color: #e9ecef;
                    --font-family: 'Poppins', sans-serif;
                }

                .app-layout {
                    display: flex;
                    gap: 2rem;
                    width: 100%;
                    max-width: 1200px;
                    margin-bottom: 2rem;
                    max-height: 100%;
                }

                .app-layout.single-panel {
                    justify-content: center;
                }

                .config-panel, .preview-panel {
                    background: white;
                    padding: 2rem;
                    border-radius: 12px;
                    box-shadow: 0 8px 30px rgba(0,0,0,0.1);
                }

                .config-panel {
                    flex: 1;
                }

                .config-panel.full-width,
                .preview-panel.full-width {
                    flex: none;
                    width: 100%;
                }

                .preview-panel {
                    flex: 2;
                    display: flex;
                    flex-direction: column;
                }

                .preview-content {
                    flex: 1;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 300px;
                }

                .button-group {
                    display: grid;
                    width: 100%;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 1rem;
                    margin-top: 1.5rem;
                    justify-content: centar;
                }

                .button-group > :only-child {
                    grid-column: 1 / -1;        /* El hijo ocupa toda la fila (ambas columnas) */
                    justify-self: center;        /* Centra el hijo dentro de esa fila */
                    width: min(360px, 100%);     /* Opcional: evita que se vea “gigante” en pantallas grandes */
                }

                .game-btn.secondary {
                    background-color: white;
                    color: var(--primary-color);
                    border: 2px solid var(--primary-color);
                }

                .game-btn.secondary:hover {
                    background-color: rgba(0, 123, 255, 0.05);
                }
                
                h2 {
                    color: var(--primary-color);
                    text-align: center;
                    margin-bottom: 1.5rem;
                }

                /* --- Título Animado --- */
                .animated-title-container {
                    position: relative;
                    margin-bottom: 2rem;
                    display: flex;
                    justify-content: center;
                }

                .animated-title {
                    display: flex;
                    justify-content: center;
                    color: var(--primary-color);
                    margin: 0;
                    font-weight: 700;
                    font-size: 2.2rem;
                }

                .animated-title span {
                    display: inline-block;
                    opacity: 0;
                    transform: scale(0.5) translateY(50px);
                    animation: popIn 0.6s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }

                @keyframes popIn {
                    100% {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }

                .floating-icons span {
                    position: absolute;
                    color: var(--primary-color);
                    opacity: 0.3;
                    font-size: 1.5rem;
                    font-weight: 700;
                    animation: float 4s ease-in-out infinite;
                }

                .floating-icons .icon-1 { top: -20px; left: 10%; animation-delay: 0s; }
                .floating-icons .icon-2 { top: 0; right: 10%; animation-delay: 1s; }
                .floating-icons .icon-3 { bottom: 0px; left: 20%; animation-delay: 2s; }
                .floating-icons .icon-4 { bottom: -10px; right: 20%; animation-delay: 3s; }

                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-15px); }
                }


                .form-section {
                    margin-bottom: 1.5rem;
                }

                .form-section label {
                    display: block;
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                }

                .ra-config {
                    margin-top: 1rem;
                }

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
                    background: #ffffff;
                    transition: border-color 0.2s ease, box-shadow 0.2s ease,
                        transform 0.2s ease;
                }

                .ra-stage-card.is-active {
                    border-color: var(--primary-color);
                    box-shadow: 0 10px 24px rgba(0, 119, 182, 0.2);
                    background: linear-gradient(
                        160deg,
                        rgba(0, 119, 182, 0.08),
                        rgba(255, 255, 255, 0.95)
                    );
                }

                .ra-stage-toggle {
                    display: flex;
                    gap: 0.6rem;
                    align-items: center;
                    font-weight: 600;
                    color: var(--dark-color);
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
                    font-family: var(--font-family);
                    background: #ffffff;
                }

                .ra-field:focus {
                    outline: 2px solid rgba(0, 119, 182, 0.3);
                    border-color: var(--primary-color);
                }

                .ra-preview-btn {
                    align-self: start;
                    background-color: rgba(0, 119, 182, 0.1);
                    color: var(--dark-color);
                    border: 1px solid rgba(0, 119, 182, 0.3);
                }

                .ra-preview-btn:hover {
                    background-color: rgba(0, 119, 182, 0.18);
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

                /* === Fondo/overlay RA estilo script.js === */
                .cm-ar-bg {
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
                .cm-ar-bg-camera {
                    background: transparent;
                }

                /* Video de la cámara como fondo */
                .cm-ar-camera-bg {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    z-index: 0;
                    border-radius: 28px;
                }

                .cm-ar-bg-elements {
                    position: absolute;
                    inset: 0;
                    background:
                        radial-gradient(circle at 20% 20%, rgba(255,255,255,0.1) 0%, transparent 50%),
                        radial-gradient(circle at 80% 80%, rgba(255,255,255,0.1) 0%, transparent 50%);
                    pointer-events: none;
                }

                .cm-ar-content {
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

                /* El "marco" donde va tu canvas Three.js */
                .cm-ar-three-wrap {
                    width: 100%;
                    height: 240px;
                    overflow: hidden;
                    position: relative;
                    z-index: 1;
                }

                /* Opcional: texto superior tipo "10 puntos" o "Puntuación final" */
                .cm-ar-top {
                    color: #ffd60a;
                    font-weight: 800;
                    text-shadow: 2px 2px 8px #3a0ca3, 0 0 20px rgba(0,0,0,0.8);
                    text-align: center;
                    background: rgba(0, 0, 0, 0.4);
                    padding: 0.8rem 1.5rem;
                    border-radius: 12px;
                    backdrop-filter: blur(5px);
                }
                
                select, input {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #ced4da;
                    border-radius: 8px;
                    font-size: 1rem;
                    font-family: var(--font-family);
                }

                .main-btn {
                    padding: 0.75rem;
                    font-size: 1.1rem;
                    font-weight: 600;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    background-color: var(--primary-color);
                    color: white;
                    transition: background-color 0.3s;
                }
                .main-btn:hover {
                    background-color: #0056b3;
                }

                .game-container {
                    border: 2px dashed var(--primary-color);
                    border-radius: 12px;
                    padding: 2rem;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: 100%;
                    background-color: var(--light-color);
                }

                .game-container.placeholder {
                    color: var(--secondary-color);
                }
                
                .game-container.welcome h2 { margin-bottom: 0.5rem; }
                .game-container.welcome p { margin-bottom: 2rem; color: var(--secondary-color); }

                .operation-display {
                    font-size: 4rem;
                    font-weight: 700;
                    color: var(--dark-color);
                    margin-bottom: 2rem;
                    min-height: 80px;
                }

                .score {
                    font-size: 1.5rem;
                    font-weight: 600;
                    margin-top: auto;
                    color: var(--primary-color);
                }

                .options-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 1rem;
                    width: 100%;
                    max-width: 400px;
                    margin-bottom: 2rem;
                }

                .option-btn {
                    padding: 1.5rem;
                    font-size: 1.5rem;
                    border: 2px solid #ced4da;
                    border-radius: 8px;
                    background-color: white;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: var(--dark-color); /* FIX: Asegura que el texto sea visible. */
                }

                .option-btn:hover {
                    border-color: var(--primary-color);
                    color: var(--primary-color);
                }

                .option-btn.selected {
                    background-color: var(--primary-color);
                    color: white;
                    border-color: var(--primary-color);
                }

                .game-btn {
                    padding: 0.75rem 1.5rem;
                    font-size: 1rem;
                    font-weight: 600;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background-color 0.3s;
                }
                
                .game-btn.primary { background-color: var(--primary-color); color: white; }
                .game-btn.primary:hover { background-color: #0056b3; }
                .game-btn.success { background-color: var(--success-color); color: white; }
                .game-btn.success:hover { background-color: #1e7e34; }
                .game-btn.success:disabled { background-color: #6c757d; cursor: not-allowed; }

                /* SweetAlert2 Customizations */
                .swal2-popup {
                    border-radius: 28px !important;
                }
                .swal2-title {
                    font-family: var(--font-family);
                }
                .swal2-html-container {
                    font-family: var(--font-family);
                }
                .swal2-cancel {
                    background-color: white !important;
                    color: #0077b6 !important;
                    border: 2px solid #0077b6 !important;
                }
                .swal2-cancel:hover {
                    background-color: rgba(0, 123, 255, 0.05) !important;
                }

                /* === Estilos de Pestañas RA === */
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
                    font-family: var(--font-family);
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
                    font-size: 1.5rem;
                }

                .ar-card-title {
                    font-weight: 600;
                    color: var(--dark-color);
                    font-size: 1.1rem;
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
                    font-size: 1.1rem;
                    margin: 0;
                }

                @media (max-width: 768px) {
                    .ar-content-cards {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>

            {/* --- HTML ESTRUCTURA --- */}
            <div className="app-layout single-panel">
                {/* PASO 1: Configuración de RA */}
                {setupStep === "ar" && (
                    <div className="config-panel full-width">
                        <AnimatedTitle />

                        {/* Pestañas de etapas */}
                        <div className="ar-tabs">
                            {AR_STAGES.map((stage) => (
                                <button
                                    key={stage}
                                    className={`ar-tab ${activeARTab === stage ? "active" : ""} ${arSelectedStages[stage] ? "has-content" : ""}`}
                                    onClick={() => setActiveARTab(stage)}
                                >
                                    {stage}
                                    {arSelectedStages[stage] && <span className="tab-indicator"></span>}
                                </button>
                            ))}
                        </div>

                        {/* Contenido de la pestaña activa */}
                        <div className="ar-tab-content">
                            <div className="ar-tab-header">
                                <label className="ar-stage-toggle">
                                    <input
                                        type="checkbox"
                                        checked={!!arSelectedStages[activeARTab]}
                                        onChange={() => toggleARStage(activeARTab)}
                                    />
                                    <span>Habilitar etapa "{activeARTab}"</span>
                                </label>
                            </div>

                            {arSelectedStages[activeARTab] && (
                                <div className="ar-content-cards">
                                    {/* Tarjeta de Texto */}
                                    <div className={`ar-content-card ${arConfig?.[activeARTab]?.text?.trim() ? "has-content" : ""}`}>
                                        <div className="ar-card-header">
                                            <span className="ar-card-icon">📝</span>
                                            <span className="ar-card-title">Texto</span>
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

                                    {/* Tarjeta de Imagen */}
                                    <div className={`ar-content-card ${arConfig?.[activeARTab]?.imageUrl?.trim() ? "has-content" : ""}`}>
                                        <div className="ar-card-header">
                                            <span className="ar-card-icon">🖼️</span>
                                            <span className="ar-card-title">Imagen</span>
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

                                    {/* Tarjeta de Audio */}
                                    <div className={`ar-content-card ${arConfig?.[activeARTab]?.audioUrl?.trim() ? "has-content" : ""}`}>
                                        <div className="ar-card-header">
                                            <span className="ar-card-icon">🎵</span>
                                            <span className="ar-card-title">Audio</span>
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

                                    {/* Tarjeta de Video */}
                                    <div className={`ar-content-card ${arConfig?.[activeARTab]?.videoUrl?.trim() ? "has-content" : ""}`}>
                                        <div className="ar-card-header">
                                            <span className="ar-card-icon">🎬</span>
                                            <span className="ar-card-title">Video</span>
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
                            )}

                            {!arSelectedStages[activeARTab] && (
                                <div className="ar-disabled-message">
                                    <p>Habilita esta etapa para configurar el contenido de Realidad Aumentada.</p>
                                </div>
                            )}
                        </div>

                        <button className="main-btn" onClick={saveARConfigAndContinue}>
                            Continuar <GrLinkNext style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }} />
                        </button>
                    </div>
                )}

                {/* PASO 2: Configuración del Juego */}
                {setupStep === "game" && (
                    <div className="config-panel full-width">
                        <AnimatedTitle />

                        <div className="form-section">
                            <label htmlFor="level-select">Seleccione el nivel de dificultad:</label>
                            <select
                                id="level-select"
                                value={config.level}
                                onChange={(e) => setConfig({ ...config, level: e.target.value })}
                            >
                                {levels.map((level) => (
                                    <option key={level} value={level}>
                                        {level.charAt(0).toUpperCase() + level.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-section">
                            <label htmlFor="exercise-count">Seleccione el número de ejercicios a realizar:</label>
                            <input
                                type="number"
                                id="exercise-count"
                                value={config.exerciseCount}
                                onChange={(e) =>
                                    setConfig({
                                        ...config,
                                        exerciseCount: Math.max(1, Math.min(availableCount, parseInt(e.target.value, 10) || 1)),
                                    })
                                }
                                min="1"
                                max={availableCount}
                                disabled={availableCount === 0}
                            />
                        </div>

                        <div className="button-group">
                            <button className="game-btn secondary" onClick={() => setSetupStep("ar")}>
                                <IconArrowBack /> Volver a RA
                            </button>
                            <button id="preview-btn" className="main-btn" onClick={handleShowPreview}>
                                Continuar <GrLinkNext style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }} />
                            </button>
                        </div>
                    </div>
                )}

                {/* PASO 3: Vista Previa */}
                {setupStep === "preview" && (
                    <div className="preview-panel full-width">
                        <AnimatedTitle />

                        <div className="preview-content">
                            {renderPreviewArea()}
                        </div>

                        <div className="button-group">
                            <button className="game-btn secondary" onClick={() => { setSetupStep("game"); setGameState("config"); }}>
                                <IconArrowBack /> Volver a Configuración
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default CalculoMental;
