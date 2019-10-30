import * as THREE from './three/build/three.module.js';
import * as CONSTANT from './constant.js';
import { FBXLoader } from './three/examples/jsm/loaders/FBXLoader.js';
import { WEBGL } from './three/examples/jsm/WebGL.js';

const debug = true;
const modelScale = 0.0075;
const minFPS = 24, maxFPS = 60;
const millisecond = 1000;
const markerGroup = {};
const modelMixerGroup = {};
const onRenderFcts = [];
const width = window.innerWidth, height = window.innerHeight;

var lastTimeMsec = null;
var scene, camera, renderer, stats;
var arToolkitContext, arToolkitSource;
var manager, fbxLoader, textureLoader;

var OnResize = function () {
    arToolkitSource.onResizeElement();
    arToolkitSource.copyElementSizeTo(renderer.domElement);
    if (arToolkitContext.arController !== null) {
        arToolkitSource.copyElementSizeTo(arToolkitContext.arController.canvas)
    }
}

export default function CLICK() {

    CLICK.prototype.init = function () {
        const container = document.body;

        /*--------------------------------------------------------------------------------
                    Init
        --------------------------------------------------------------------------------*/

        // init renderer
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);
        renderer.shadowMap.enabled = true;
        renderer.debug.checkShaderErrors = true;
        container.appendChild(renderer.domElement);

        /*--------------------------------------------------------------------------------
                    Initialize scene and basic camera
        --------------------------------------------------------------------------------*/

        // init scene 
        scene = new THREE.Scene();

        // Create a camera
        // camera = new THREE.Camera();
        camera = new THREE.PerspectiveCamera(60, width / window.height, 0.1, 100);
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
            // debug: true,
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

        if (debug) {
            stats = new Stats();
            container.appendChild(stats.dom);
        }

        // render the scene
        onRenderFcts.push(function () {
            renderer.render(scene, camera);

            if (debug) {
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
        });

        // build a smoothedControls
        var smoothedRoot = new THREE.Group();
        scene.add(smoothedRoot);
        var smoothedControls = new THREEx.ArSmoothedControls(smoothedRoot, {
            lerpPosition: 0.4,
            lerpQuaternion: 0.3,
            lerpScale: 1,
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

                    textureLoader.load(texturePath,
                        function (texture) {
                            var newMat = new THREE.MeshBasicMaterial();
                            for (var key in newMat.material) {
                                newMat[key] = child.material[key];
                            }
                            newMat.map = texture;
                            newMat.type = "MeshBasicMaterial";
                            newMat.skinning = true;

                            newMat.flatShading = true;
                            newMat.polygonOffset = true;
                            newMat.side = THREE.DoubleSide;
                            newMat.combine = THREE.MixOperation;

                            child.material = newMat;

                            child.castShadow = true;
                            child.receiveShadow = true;
                        },
                        undefined,
                        function (error) {
                            console.error(error);
                        });
                }
                else if (!debug && child.name == "Cha_joint") {
                    child.visible = false;
                }
            });

            if (debug) {
                model.translateZ(0.5);
                model.rotation.x = -Math.PI / 2;
            }
            model.scale.set(modelScale, modelScale, modelScale);
            markerRoot.add(model);
        }, undefined,
            function (error) {
                console.error(error);
            });
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
        // textureLoader.setPath(CONSTANT.MODEL_FOLDER);

        fbxLoader = new FBXLoader(manager);
        // fbxLoader.setPath(CONSTANT.MODEL_FOLDER);

        // tgaLoader = new TGALoader(manager);
        // tgaLoader.setPath(CONSTANT.MODEL_FOLDER);

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
}