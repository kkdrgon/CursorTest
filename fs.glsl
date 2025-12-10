#version 300 es
precision mediump float;

uniform sampler2D uTexture;

in vec3 vTexCoord;
out vec4 FragColor;

void main() {
     //FragColor = vec4(1,0,0,1);
     //return;
    vec4 fc = texture(uTexture, vTexCoord.xy);

    if(fc.a < 0.1) {
        discard;
    }

    if(vTexCoord.z < 0.5) {
        fc.a = vTexCoord.z;
    }

    FragColor = fc;
}
