import Shader from './shader'
import * as bp from './boilerplate.ts'

import perlinCode from './assets/perlinNoise.wgsl?raw'
import computeCode from './assets/downscale.wgsl?raw'
import testCode from './assets/copy.wgsl?raw'

// SETUP -------------------------------
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
// SETUP END -------------------------------



// GLOBALS -------------------------------

//// charSize determines the workgroup size, denoting the size of each downscaled "tile"
const charSize = {
    width: 4,
    height: 8,
};

//// this determines the canvas size, or how many "tiles" we want (also representing the
//// number of characters we want in the .readme codeblock)
const charCount = {
    width: 125,
    height: 20,
}

const size = {
    width: charCount.width * charSize.width,
    height: charCount.height * charSize.height,
}
console.log("Size: ", size.width, size.height)

//// apply size to canvas
canvas.width = size.width;
canvas.height = size.height;
canvas.style.width = size.width + 'px';
canvas.style.height = size.height + 'px';

//// specify dispatch
// const dispatch = {
//     x: Math.ceil(charCount.width / charSize.width),
//     y: Math.ceil(charCount.height / charSize.height),
// }
const dispatch = {
    x: Math.ceil(charCount.width),
    y: Math.ceil(charCount.height),
}

//// size (bytes) = total num of tiles * 4, because tiles are of type u32 in the compute shader
const readWriteBufferSize = charCount.width * charCount.height * 4;
// GLOBALS END -------------------------------



// BUFFERS -------------------------------

//// frag buffers
const usage = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;

const resBuffer = device.createBuffer({size:8,usage: usage, label: 'resBuff'});
device.queue.writeBuffer(resBuffer, 0, new Float32Array([size.width, size.height]));

const gridSize = device.createBuffer({size:4,usage: usage, label:'gridBuff'});
device.queue.writeBuffer(gridSize, 0, new Float32Array([2]));

const randSeed = Math.random() * 100000
console.log("seed: ", randSeed)
const seed = device.createBuffer({size:4,usage: usage, label:'seedBuff'});
device.queue.writeBuffer(seed, 0, new Float32Array([randSeed]));

const intensity = device.createBuffer({size:4,usage: usage, label:'intensBuff'});
device.queue.writeBuffer(intensity, 0, new Float32Array([1.5]));


//// compute buffers
const thresh = device.createBuffer({size:4,usage: usage, label:'intensBuff'});
device.queue.writeBuffer(thresh, 0, new Float32Array([10]));

// BUFFERS END -------------------------------



// PERLIN SHADER -------------------------------
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
const renderTarget = device.createTexture({
    label: 'renderTarget',
    format: canvasFormat,
    size: [size.width, size.height],
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
});

const perlinShader = new Shader({
    pipeline: perlinPipeline,
    bindGroup: perlinBindGroup,
    renderTarget: renderTarget,
});
// PERLIN SHADER END -------------------------------



// COMPUTE SHADER -------------------------------

const storageBuffer = device.createBuffer({
    size: readWriteBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    label: 'storageBuffer',
});

const readBuffer = device.createBuffer({
    label: 'readBuffer',
    size: readWriteBufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
});

const testBuffer = device.createBuffer({
    label: 'readBuffer',
    size: readWriteBufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
});

const computeModule = device.createShaderModule({
    code: computeCode,
});

const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
        module: computeModule,
        entryPoint: 'main',
    },
});

const computeBindGroup = device.createBindGroup({
    label: 'downscaleBindGroup',
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
        {binding: 0, resource: {buffer: storageBuffer}},
        {binding: 1, resource: perlinShader.renderTarget.createView()},
        {binding: 2, resource: { buffer: thresh }},
    ]
})

const computeShader = new Shader({
    pipeline: computePipeline,
    bindGroup: computeBindGroup,
    storageBuffer: storageBuffer,
});

// COMPUTE SHADER END -------------------------------



function render(shader) {
    let renderTarget = context.getCurrentTexture()
    if(shader.renderTarget != undefined) {
        console.log('Rendering noise to specified rendertarget (from frag shader)')
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

async function renderCompute(shader, readBuffer) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass({label: 'compute encoder'});
    pass.setPipeline(shader.pipeline);
    pass.setBindGroup(0, shader.bindGroup);
    pass.dispatchWorkgroups(dispatch.x >>>0, dispatch.y >>>0, 1); // convert nums to unsigned long
    pass.end();

    encoder.copyBufferToBuffer(shader.storageBuffer, 0, readBuffer, 0, readWriteBufferSize);
    encoder.copyBufferToBuffer(shader.storageBuffer, 0, testBuffer, 0, readWriteBufferSize);
    device.queue.submit([encoder.finish()]);

    await Promise.all([
        readBuffer.mapAsync(GPUMapMode.READ),
    ]).then(() => {
        const result = new Uint32Array(readBuffer.getMappedRange());

        const arr = returnZeroIndices(result)
        console.log(result)
        console.log(arr)

        console.log(dispatch)
        // readBuffer.unmap()
    })
}

function returnZeroIndices(array) {
    const newArr = [];
    for(const e in array) {
        if(array[e] == 0) {
            newArr.push(e * 1);
        }
    }
    return newArr;
}

render(perlinShader)
renderCompute(computeShader, readBuffer)

// TEST SHADER -------------------------------
const testRes = device.createBuffer({size:8,usage: usage, label: 'resBuff'});
device.queue.writeBuffer(testRes, 0, new Float32Array([charCount.width, charCount.height]));
// device.queue.writeBuffer(testRes, 0, new Float32Array([20,5]));

const testModule = device.createShaderModule({
    code: testCode,
});
const testPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
        module: testModule,
        targets: [{format: canvasFormat}],
    },
    fragment: {
        module: testModule,
        targets: [{format: canvasFormat}],
    },
});
const testBindGroup = device.createBindGroup({
    label: 'perlin bindgroup',
    layout: testPipeline.getBindGroupLayout(0),
    entries: [
        {binding: 0, resource: {buffer: testBuffer}},
        {binding: 1, resource: {buffer: testRes}},
    ],
});

const testShader = new Shader({
    pipeline: testPipeline,
    bindGroup: testBindGroup,
});
// TEST SHADER END -------------------------------

render(testShader)