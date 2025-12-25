const vscode = require('vscode');
const path = require('path');

class GravityWellPanel {
    constructor(context) {
        this.context = context;
        this.panel = null;
    }

    show(analysis) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.gravityWell',
                'Vestige: 3D Gravity Well',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                }
            );
            this.panel.onDidDispose(() => { this.panel = null; });
        }

        this.panel.webview.html = this.getWebviewContent(analysis);
    }

    getWebviewContent(analysis) {
        const neighbors = analysis.knowledgeNeighbors || [];
        const data = neighbors.map(n => ({
            name: n.name,
            strength: n.strength,
            distance: Math.max(10, 100 - n.strength * 5)
        }));

        const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'vestige.css'));

        return `<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="${cssUri}">
    <style>
        body { margin: 0; background: #0F172A; overflow: hidden; }
        #label { position: absolute; top: 20px; left: 20px; color: #60A5FA; font-size: 1.2em; font-weight: bold; pointer-events: none; }
    </style>
</head>
<body>
    <div id="label">3D Architectural Gravity Well: ${path.basename(analysis.filePath)}</div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script>
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        // Lights
        const ambientLight = new THREE.AmbientLight(0x404040);
        scene.add(ambientLight);
        const pointLight = new THREE.PointLight(0x60A5FA, 2, 300);
        scene.add(pointLight);

        // Core (Current File) - Pulsating Shader-like effect
        const coreGeometry = new THREE.SphereGeometry(3, 32, 32);
        const coreMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x60A5FA, 
            emissive: 0x2563EB,
            shininess: 100,
            transparent: true,
            opacity: 0.9
        });
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        scene.add(core);

        // Code Flux Particle System (Phase Zenith)
        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCount = 1000;
        const posArray = new Float32Array(particlesCount * 3);
        const velocityArray = new Float32Array(particlesCount * 3);
        
        for(let i=0; i < particlesCount * 3; i++) {
            posArray[i] = (Math.random() - 0.5) * 100;
            velocityArray[i] = (Math.random() - 0.5) * 0.1;
        }
        
        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        const particlesMaterial = new THREE.PointsMaterial({ 
            size: 0.05, 
            color: 0xF472B6,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
        scene.add(particlesMesh);

        // Satellites (Coupled Files)
        const neighbors = ${JSON.stringify(data)};
        const satellites = [];

        neighbors.forEach(n => {
            const size = Math.max(0.5, n.strength / 10);
            const geo = new THREE.SphereGeometry(size, 16, 16);
            const mat = new THREE.MeshPhongMaterial({ color: 0xF472B6, emissive: 0xDB2777 });
            const sat = new THREE.Mesh(geo, mat);
            
            // Random orbit position
            const angle = Math.random() * Math.PI * 2;
            sat.position.x = Math.cos(angle) * n.distance;
            sat.position.z = Math.sin(angle) * n.distance;
            sat.position.y = (Math.random() - 0.5) * 20;
            
            sat.userData = { angle, distance: n.distance, speed: 0.005 + Math.random() * 0.01 };
            satellites.push(sat);
            scene.add(sat);

            // Orbit line
            const curve = new THREE.EllipseCurve(0, 0, n.distance, n.distance);
            const points = curve.getPoints(50);
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, 0, p.y)));
            const lineMat = new THREE.LineBasicMaterial({ color: 0x60A5FA, transparent: true, opacity: 0.1 });
            const orbit = new THREE.LineLoop(lineGeo, lineMat);
            orbit.rotation.x = Math.random() * Math.PI;
            scene.add(orbit);
        });

        camera.position.z = 100;

        let frame = 0;
        const mouse = new THREE.Vector2();
        const raycaster = new THREE.Raycaster();

        window.addEventListener('mousemove', (event) => {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
            // Subtle camera tilt
            camera.position.x += (mouse.x * 10 - camera.position.x) * 0.05;
            camera.position.y += (-mouse.y * 10 - camera.position.y) * 0.05;
            camera.lookAt(scene.position);
        });

        function animate() {
            requestAnimationFrame(animate);
            frame += 0.01;

            satellites.forEach(s => {
                s.userData.angle += s.userData.speed;
                s.position.x = Math.cos(s.userData.angle) * s.userData.distance;
                s.position.z = Math.sin(s.userData.angle) * s.userData.distance;
                s.position.y += Math.sin(frame + s.userData.angle) * 0.02;
                
                // Pulsate scale based on strength
                const pulseScale = 1 + Math.sin(frame * 3 + s.userData.angle) * 0.1;
                s.scale.set(pulseScale, pulseScale, pulseScale);
            });

            // Core Pulse
            const pulse = 1 + Math.sin(frame * 2) * 0.1;
            core.scale.set(pulse, pulse, pulse);
            core.rotation.y += 0.005;

            // Particle movement (Entropy flow)
            const positions = particlesMesh.geometry.attributes.position.array;
            for(let i=0; i < particlesCount * 3; i+=3) {
                positions[i] += velocityArray[i];
                positions[i+1] += velocityArray[i+1];
                positions[i+2] += velocityArray[i+2];
                
                if (Math.abs(positions[i]) > 100) positions[i] *= -0.9;
                if (Math.abs(positions[i+1]) > 50) positions[i+1] *= -0.9;
                if (Math.abs(positions[i+2]) > 100) positions[i+2] *= -0.9;
            }
            particlesMesh.geometry.attributes.position.needsUpdate = true;
            particlesMesh.rotation.y += 0.001;

            // Interaction Check
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(satellites);
            
            satellites.forEach(s => s.material.emissiveIntensity = 1);
            if (intersects.length > 0) {
                const hovered = intersects[0].object;
                hovered.material.emissiveIntensity = 5;
                // We could show a tooltip here in screen space
            }

            renderer.render(scene, camera);
        }
        animate();

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    </script>
</body>
</html>`;
    }
}

module.exports = GravityWellPanel;
