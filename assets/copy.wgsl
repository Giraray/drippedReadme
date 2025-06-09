struct OurVertexShaderOutput {
    @builtin(position) position: vec4f,
    @location(0) fragUV: vec2f,
};

@group(0) @binding(0) var<storage> buffer : array<u32>;
@group(0) @binding(1) var<uniform> uResolution: vec2<f32>;

@vertex fn vertexMain(
    @builtin(vertex_index) vertexIndex : u32
) -> OurVertexShaderOutput {
    let pos = array(

        // 1st triangle
        vec2f( -1.0,  -1.0),  // bottom right
        vec2f( -1.0,  1.0),  // top right
        vec2f( 1.0,  -1.0),  // bottom right

        // 2st triangle
        vec2f( 1.0,  1.0),  // top right
        vec2f( -1.0,  1.0),  // top left
        vec2f( 1.0,  -1.0),  // bottom right
    );

    var vsOutput: OurVertexShaderOutput;
    let xy = pos[vertexIndex];
    vsOutput.position = vec4f(xy, 0.0, 1.0);

    vsOutput.fragUV = (xy + 1) / 2; // convert clip-space (-1 - 1) to UV (0 - 1)

    return vsOutput;
}

@fragment fn fragMain(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
    var uv = fsInput.fragUV;

    var res = uResolution;

    uv *= res;
    uv = ceil(uv);

    var newUv = vec2<u32>(uv);

    var val = f32(buffer[newUv.x*newUv.y]);

    // return vec4(uv, 0.0, 1.0);
    return vec4(vec3(val/(res.x*res.y)), 1.0);
}