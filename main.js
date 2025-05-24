import Shader from './shader'
import * as bp from './boilerplate.ts'

import perlinCode from './assets/perlinNoise.wgsl?raw'

// SETUP
if(!navigator.gpu) {
    alert('WebGPU is currently only supported in Chromium based browsers.')
    throw new Error('WebGPU not supported on this browser');
}
const adapter = await navigator.gpu.requestAdapter();
if(!adapter) {
    alert(`No appropriate GPUAdapter found. There are either no GPUs available for the browser, or the browser settings has graphics acceleration turned off.`)
    throw new Error('No appropriate GPUAdapter found');
}

const device = await adapter.requestDevice();
const canvas = document.getElementById('c')
const context = canvas.getContext('webgpu');

const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device: device,
    format: canvasFormat,
});
// SETUP END

// GLOBALS
const size = {
    width: 1200,
    height: 300,
};
const sizeMult = 1/8; // 1/8
canvas.width = size.width * sizeMult;
canvas.height = size.height * sizeMult;

canvas.style.width = size.width + 'px';
canvas.style.height = size.height + 'px';
// GLOBALS END

// BUFFERS
const usage = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;

const resBuffer = device.createBuffer({size:8,usage: usage, label: 'resBuff'});
device.queue.writeBuffer(resBuffer, 0, new Float32Array([size.width, size.height]));

const gridSize = device.createBuffer({size:4,usage: usage, label:'gridBuff'});
device.queue.writeBuffer(gridSize, 0, new Float32Array([2]));

const randSeed = Math.random() * 100000
console.log(randSeed)
const seed = device.createBuffer({size:4,usage: usage, label:'seedBuff'});
device.queue.writeBuffer(seed, 0, new Float32Array([randSeed]));

const intensity = device.createBuffer({size:4,usage: usage, label:'intensBuff'});
device.queue.writeBuffer(intensity, 0, new Float32Array([1.5]));
// BUFFERS END

const perlinModule = device.createShaderModule({
    code: perlinCode,
});
const perlinPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
        module: perlinModule,
        targets: [{format: canvasFormat}],
    },
    fragment: {
        module: perlinModule,
        targets: [{format: canvasFormat}],
    },
});
const perlinBindGroup = device.createBindGroup({
    label: 'perlin bindgroup',
    layout: perlinPipeline.getBindGroupLayout(0),
    entries: [
        {binding: 0, resource: {buffer: resBuffer}},
        {binding: 1, resource: {buffer: gridSize}},
        {binding: 2, resource: {buffer: seed}},
        {binding: 3, resource: {buffer: intensity}},
    ],
});

const perlinShader = new Shader({
    pipeline: perlinPipeline,
    bindGroup: perlinBindGroup,
});

function render(shader) {
    let renderTarget = context.getCurrentTexture()
    if(shader.renderTarget != undefined) {
        renderTarget = shader.renderTarget;
    }

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        label: 'img pass',
        colorAttachments: [{
            view: renderTarget.createView(),
            clearValue: [0,0,0,1],
            loadOp: 'clear',
            storeOp: 'store',
        }],
    })
    pass.setPipeline(shader.pipeline);
    pass.setBindGroup(0, shader.bindGroup);
    pass.draw(6);
    pass.end();

    device.queue.submit([encoder.finish()]);
}

render(perlinShader)