/**
 * SceneManager - Manages Three.js scene, camera, renderer, and controls
 */

import * as THREE from "https://esm.sh/three@0.160.0";
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/OutputPass.js";

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.setupRenderer();
    this.setupCamera();
    this.setupLighting();
    this.setupControls();
    this.setupPostFX();

    this.animationCallbacks = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isDragging = false;
    this.mouseDownPos = { x: 0, y: 0 };
    this.mouseUpPos = { x: 0, y: 0 };
  }

  setupPostFX() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.outlinePass = new OutlinePass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.scene,
      this.camera
    );
    this.outlinePass.edgeStrength = 3.0;
    this.outlinePass.edgeThickness = 1.5;
    this.outlinePass.pulsePeriod = 0.0;
    this.outlinePass.visibleEdgeColor.set(0xffffff);
    this.outlinePass.hiddenEdgeColor.set(0x000000);
    this.composer.addPass(this.outlinePass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  enableOutlineFor(objs) {
    if (!this.outlinePass) return;
    this.outlinePass.selectedObjects = Array.isArray(objs) ? objs : [objs];
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener("resize", () => this.onWindowResize());
    window.addEventListener("mousemove", (event) => this.onMouseMove(event));
    this.renderer.domElement.addEventListener("mousedown", (event) =>
      this.onMouseDown(event)
    );
    this.renderer.domElement.addEventListener("mouseup", (event) =>
      this.onMouseUp(event)
    );

    this.renderer.setClearAlpha(0);
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.initialPosition = new THREE.Vector3(0, 0, 0.5);
    this.initialLookAt = new THREE.Vector3(0, 0, 0);
    this.camera.position.copy(this.initialPosition);
    this.camera.lookAt(this.initialLookAt);
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 8.0;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.18;
    this.controls.rotateSpeed = 0.9;
    this.controls.autoRotate = false;
    this.controls.enableKeys = true;
    this.controls.screenSpacePanning = false;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;
  }

  onMouseMove(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  onMouseDown(event) {
    this.isDragging = false;
    this.mouseDownPos = { x: event.clientX, y: event.clientY };
  }

  onMouseUp(event) {
    this.mouseUpPos = { x: event.clientX, y: event.clientY };
    const dx = this.mouseUpPos.x - this.mouseDownPos.x;
    const dy = this.mouseUpPos.y - this.mouseDownPos.y;
    const dragDistance = Math.sqrt(dx * dx + dy * dy);
    if (dragDistance < 5) this.handleClick(event);
  }

  handleClick() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(
      this.scene.children,
      true
    );
    if (intersects.length > 0) {
      const intersectedObject = intersects[0].object;
      if (
        intersectedObject.userData &&
        intersectedObject.userData.pageNumber
      ) {
        openSubpage(intersectedObject.userData.pageNumber);
      }
    }
  }

  addObject(object) {
    this.scene.add(object);
  }

  addAnimationCallback(callback) {
    this.animationCallbacks.push(callback);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const isGalleryOpen = !!(
      window.App && window.App.galleryProgress >= 0.98
    );
    const introOverlayVisible = !!(window.App && window.App.overlayActive);

    this.controls.update();
    this.animationCallbacks.forEach((cb) => cb());

    if (!isGalleryOpen && !introOverlayVisible) {
      this.composer.render();
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }
}


