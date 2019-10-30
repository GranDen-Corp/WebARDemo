import * as THREE from './three/build/three.module.js';
import * as CONSTANT from './constant.js';
import { FBXLoader } from './three/examples/jsm/loaders/FBXLoader.js';
import { TGALoader } from './three/examples/jsm/loaders/TGALoader.js';
import { WEBGL } from './three/examples/jsm/WebGL.js';

const modelScale = 0.01;
const minFPS = 24, maxFPS = 60;
const millisecond = 1000;
const markerGroup = {};
const modelMixerGroup = {};
const onRenderFcts = [];
const width = window.innerWidth, height = window.innerHeight;

var lastTimeMsec = null;
var scene, camera, renderer, stats;
var arToolkitContext, arToolkitSource;
var manager, fbxLoader, textureLoader, tgaLoader;

export default function CLICK() {

    CLICK.prototype.init = function () {
        const container = document.body;

        /*--------------------------------------------------------------------------------
                    Init
        --------------------------------------------------------------------------------*/

        // init renderer
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            // powerPreference: 'high-performance',
            logarithmicDepthBuffer: true
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);
        renderer.shadowMap.enabled = true;
        // renderer.debug.checkShaderErrors = true;
        container.appendChild(renderer.domElement);

        /*--------------------------------------------------------------------------------
                    Initialize scene and basic camera
        --------------------------------------------------------------------------------*/

        // init scene 
        scene = new THREE.Scene();

        // Create a camera
        // camera = new THREE.Camera();
        camera = new THREE.PerspectiveCamera(100, width / window.height, 0.1, 35000);
        camera.name = 'Camera';
        scene.add(camera);

        /*--------------------------------------------------------------------------------
                    handle arToolkitSource
        --------------------------------------------------------------------------------*/
        arToolkitSource = new THREEx.ArToolkitSource({
            sourceType: 'webcam',
            sourceWidth: width,
            sourceHeight: height,
            displayWidth: width,
            displayHeight: height
        });

        arToolkitSource.init(function onReady() {
            OnResize();
        });

        /*--------------------------------------------------------------------------------
                    initialize arToolkitContext
        --------------------------------------------------------------------------------*/
        // create atToolkitContext
        arToolkitContext = new THREEx.ArToolkitContext({
            // debug: CONSTANT.DEBUG,
            cameraParametersUrl: THREEx.ArToolkitContext.baseURL + CONSTANT.CAMERA_PARAM,
            detectionMode: 'mono'
        });
        // initialize it
        arToolkitContext.init(function onCompleted() {
            // copy projection matrix to camera
            camera.projectionMatrix.copy(arToolkitContext.getProjectionMatrix());
        });
        // update artoolkit on every frame
        onRenderFcts.push(function () {
            if (arToolkitSource.ready === false) return;
            arToolkitContext.update(arToolkitSource.domElement);
        });

        onRenderFcts.push(function (delta) {
            Object.keys(markerGroup).forEach(function (key) {
                let markerRoot = markerGroup[key]["root"];
                let smoothedControls = markerGroup[key]["control"];
                smoothedControls.update(markerRoot);
            });
        });

        this.initLoader();

        // handle resize
        window.addEventListener('resize', function () {
            OnResize();
        });

        /*--------------------------------------------------------------------------------
                    render the whole thing on the page
        --------------------------------------------------------------------------------*/
        onRenderFcts.push(function (delta) {
            Object.keys(modelMixerGroup).forEach(function (key) {
                modelMixerGroup[key].update(delta);
            });
        });

        if (CONSTANT.DEBUG) {
            stats = new Stats();
            container.appendChild(stats.dom);
        }

        // render the scene
        onRenderFcts.push(function () {
            renderer.render(scene, camera);

            if (CONSTANT.DEBUG) {
                stats.update();
            }
        });
    }

    CLICK.prototype.registerMarker = function (markerPatternFile) {
        // build markerControls
        var markerRoot = new THREE.Group;
        scene.add(markerRoot);
        var markerControls = new THREEx.ArMarkerControls(arToolkitContext,
            markerRoot, {
            type: 'pattern',
            patternUrl: THREEx.ArToolkitContext.baseURL + markerPatternFile,
            // changeMatrixMode: 'modelViewMatrix',
            // minConfidence: 0.8,
            // smooth: true,
            // smoothCount: 5,
            // smoothTolerance: 0.01,
            // smoothThreshold: 2,
        });

        // build a smoothedControls
        var smoothedRoot = new THREE.Group();
        scene.add(smoothedRoot);
        var smoothedControls = new THREEx.ArSmoothedControls(smoothedRoot, {
            lerpPosition: 0.4, // 0.8
            lerpQuaternion: 0.3, // 0.2
            lerpScale: 1,
            // lerpStepDelay: 1 / 60,
            // minVisibleDelay: 0.0,
            // minUnvisibleDelay: 0.2,
        });

        markerGroup[markerRoot.uuid] = {
            "root": markerRoot,
            "control": smoothedControls
        };
        return smoothedRoot;
    }

    CLICK.prototype.loadModel = function (markerRoot, modelPath, texturePath, tgaPath) {
        fbxLoader.load(modelPath, function (model) {
            model.mixer = new THREE.AnimationMixer(model);

            var animations = model.animations;
            animations.forEach(function (clip) {
                var action = model.mixer.clipAction(clip);
                action.play();
            });

            modelMixerGroup[model.uuid] = model.mixer;

            model.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    if (texturePath) {
                        textureLoader.load(texturePath,
                            function (texture) {
                                var newMat = new THREE.MeshBasicMaterial();
                                for (var key in newMat.material) {
                                    newMat[key] = child.material[key];
                                }
                                newMat.map = texture;
                                newMat.type = "MeshBasicMaterial";
                                newMat.skinning = true;
                                newMat.flatShading = false;
                                newMat.polygonOffset = true;
                                newMat.side = THREE.DoubleSide;
                                newMat.combine = THREE.MixOperation;
                                child.material = newMat;
                            },
                            undefined,
                            function (error) {
                                console.error(error);
                            });
                    }
                }
                else if (!CONSTANT.DEBUG && child.name == "Cha_joint") {
                    child.visible = false;
                }
            });

            if (CONSTANT.DEBUG) {
                model.translateZ(0.5);
                model.translateY(0.5);
                model.rotation.x = -Math.PI / 2;
            }
            model.scale.set(modelScale, modelScale, modelScale);
            markerRoot.add(model);
        }, undefined,
            function (error) {
                console.error(error);
            });
    }

    CLICK.prototype.loadDemoBox = function (markerRoot, color) {
        var markerScene = new THREE.Scene();
        markerRoot.add(markerScene)
        var geometry = new THREE.CubeGeometry(1, 1, 1);
        var material = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            color: color
        });
        var mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = geometry.parameters.height / 2;
        markerScene.add(mesh);
    }

    CLICK.prototype.initLoader = function () {
        manager = new THREE.LoadingManager(
            function () {
                console.log('Loading complete!');
            }, function (url, itemsLoaded, itemsTotal) {
                console.log('Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.');
            }, function (url) {
                console.log('There was an error loading ' + url);
            }
        );
        manager.onStart = function (url, itemsLoaded, itemsTotal) {
            console.log('Started loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.');
        };

        textureLoader = new THREE.TextureLoader(manager);
        textureLoader.setPath(CONSTANT.MODEL_FOLDER);

        fbxLoader = new FBXLoader(manager);
        fbxLoader.setPath(CONSTANT.MODEL_FOLDER);

        tgaLoader = new TGALoader(manager);
        tgaLoader.setPath(CONSTANT.MODEL_FOLDER);

        // manager.addHandler(/\.tga$/i, tgaLoader);
    }

    CLICK.prototype.display = function () {
        requestAnimationFrame(animate);
    }

    CLICK.prototype.checkCompatibility = function () {
        if (WEBGL.isWebGLAvailable()) {
            return true;
        }
        else {
            var warning = WEBGL.getWebGLErrorMessage();
            document.getElementById('container').appendChild(warning);
            return false;
        }
    }

    function animate(nowMsec) {

        // measure time
        lastTimeMsec = lastTimeMsec || nowMsec - millisecond / maxFPS;
        var deltaMsec = Math.min(millisecond / minFPS, nowMsec - lastTimeMsec);
        lastTimeMsec = nowMsec;
        // call each update function    
        onRenderFcts.forEach(function (onRenderFct) {
            onRenderFct(toSecond(deltaMsec));
        })

        // keep looping
        requestAnimationFrame(animate);
    }

    function toSecond(msec) {
        return msec / millisecond;
    }

    var OnResize = function () {
        if (arToolkitSource && arToolkitContext) {
            arToolkitSource.onResizeElement();
            arToolkitSource.copyElementSizeTo(renderer.domElement);
            if (arToolkitContext.arController !== null) {
                arToolkitSource.copyElementSizeTo(arToolkitContext.arController.canvas)
            }
        }
    }
}