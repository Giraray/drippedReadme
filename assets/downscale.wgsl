@group(0) @binding(0) var<storage, read_write> storageBuffer: array<u32>;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uThreshold: f32;

var<workgroup> tile: array<array<u32, 4>, 8>;

// not actual colors. used as increment slots for histogram analysis
const white = vec2(1.0, 0.0);
const gray = vec2(0.0, 1.0);

fn vec4Equals(a: vec4<f32>, b: vec4<f32>) -> bool {
    var boolVec = a == b;
    if(boolVec.x == false || boolVec.y == false || boolVec.z == false || boolVec.w == false) {
        return false;
    }
    return true;
}

fn vec3Equals(a: vec3<f32>, b: vec3<f32>) -> bool {
    var boolVec = a == b;
    if(boolVec.x == false || boolVec.y == false || boolVec.z == false) {
        return false;
    }
    return true;
}

@compute @workgroup_size(256) // convenient but HIGHLY suboptimal. todo fix this pls
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
    ) {

    var thresh = uThreshold;
    let screenPos: vec2<i32> = vec2(i32(global_id.x), i32(global_id.y));
    var texCol = textureLoad(uTexture, screenPos, 0).r;

    var val: u32 = 0;
    if (texCol == 1.0) {
        val = 2;
    }
    else if(texCol == 0.5) {
        val = 1;
    }

    tile[local_id.x][local_id.y] = val;

    workgroupBarrier();

    var histogram = vec2(0.0);

    for(var i = 0; i < 8; i++) {
        for(var j = 0; j < 8; j++) {
            var col = tile[i][j];

            if(col == 2) {
                histogram += white;
            }
            else {
                histogram += gray;
            }
        }
    }

    var res: u32 = 0;
    var storedVal: u32 = 0;
    var max = 0.0;
    if(histogram.x > max) {
        max = histogram.x;
        res = 2;
    }
    if(histogram.y > max) {
        max = histogram.y;
        res = 1;
    }

    if(max >= uThreshold) {
        storedVal = res;
    }

    storageBuffer[global_id.x + global_id.y] = storedVal;
    storageBuffer[global_id.x + global_id.y] = global_id.x + global_id.y;
}