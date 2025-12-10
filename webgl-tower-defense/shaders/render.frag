#version 300 es
precision highp float;

in vec3 vTexCoord; // xy: atlas UV, z: misc flag (1.0 default)

uniform sampler2D u_texture; // atlas / sprite sheet
uniform vec4 u_tint; // optional tint (default vec4(1.0))
uniform float u_brightness; // optional brightness multiplier (default 1.0)

out vec4 fragColor;

void main() {
	// 如果纹理坐标为 0，说明顶点被标记为无效，直接丢弃
	if (vTexCoord.z < 0.1) {
		discard;
	}
	
	// Sample the atlas
	vec2 uv = vTexCoord.xy;

	// Use standard bilinear filtering for smooth sprites; but nearest will be used
	// if atlas is set to NEAREST in GL state. We rely on the GL texture params.
	vec4 src = texture(u_texture, uv);

	// Discard fully transparent pixels to avoid quad corners showing
	if (src.a < 0.01) {
		discard;
	}

	// Apply tint and brightness (默认值都是1.0，如果没有设置uniform)
	vec4 tint = u_tint;
	float brightness = u_brightness;
	if (tint == vec4(0.0)) tint = vec4(1.0);
	if (brightness == 0.0) brightness = 1.0;
	
	vec3 color = src.rgb * tint.rgb * brightness;
	float alpha = src.a * tint.a;

	// Optional simple highlight: if vTexCoord.z > 1.5, slightly brighten
	if (vTexCoord.z > 1.5) {
		color = color * 1.12 + vec3(0.03);
	}

	fragColor = vec4(color, alpha);
}

