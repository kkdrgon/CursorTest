using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 轨道生成器，根据贝塞尔曲线生成3D轨道网格
/// </summary>
[RequireComponent(typeof(BezierSpline))]
[RequireComponent(typeof(MeshFilter))]
[RequireComponent(typeof(MeshRenderer))]
public class TrackGenerator : MonoBehaviour
{
    [Header("轨道设置")]
    [SerializeField] private float trackWidth = 2f;
    [SerializeField] private float trackHeight = 0.3f;
    [SerializeField] private float railHeight = 0.5f;
    [SerializeField] private float railThickness = 0.1f;
    [SerializeField] private int crossSections = 8; // 横截面分段数
    
    [Header("生成设置")]
    [SerializeField] private int resolution = 50; // 每段曲线的采样点数
    [SerializeField] private bool generateRails = true;
    [SerializeField] private bool autoUpdate = true;
    
    private BezierSpline spline;
    private MeshFilter meshFilter;
    private MeshRenderer meshRenderer;
    private Mesh trackMesh;
    
    private void Awake()
    {
        spline = GetComponent<BezierSpline>();
        meshFilter = GetComponent<MeshFilter>();
        meshRenderer = GetComponent<MeshRenderer>();
        
        GenerateTrack();
    }
    
    private void OnValidate()
    {
        if (autoUpdate && Application.isPlaying)
        {
            GenerateTrack();
        }
    }
    
    /// <summary>
    /// 生成轨道网格
    /// </summary>
    [ContextMenu("生成轨道")]
    public void GenerateTrack()
    {
        if (spline == null || spline.PointCount < 2)
        {
            Debug.LogWarning("贝塞尔曲线点数不足，无法生成轨道");
            return;
        }
        
        trackMesh = new Mesh();
        trackMesh.name = "Rollercoaster Track";
        
        List<Vector3> vertices = new List<Vector3>();
        List<int> triangles = new List<int>();
        List<Vector3> normals = new List<Vector3>();
        List<Vector2> uvs = new List<Vector2>();
        
        // 生成轨道主体
        GenerateTrackMesh(vertices, triangles, normals, uvs);
        
        // 生成护栏
        if (generateRails)
        {
            GenerateRails(vertices, triangles, normals, uvs);
        }
        
        trackMesh.vertices = vertices.ToArray();
        trackMesh.triangles = triangles.ToArray();
        trackMesh.normals = normals.ToArray();
        trackMesh.uvs = uvs.ToArray();
        
        trackMesh.RecalculateBounds();
        trackMesh.RecalculateTangents();
        
        meshFilter.mesh = trackMesh;
    }
    
    /// <summary>
    /// 生成轨道主体网格
    /// </summary>
    private void GenerateTrackMesh(List<Vector3> vertices, List<int> triangles, List<Vector3> normals, List<Vector2> uvs)
    {
        int segments = spline.SegmentCount;
        int totalPoints = segments * resolution + 1;
        
        // 为每个采样点生成横截面
        List<CrossSection> crossSections = new List<CrossSection>();
        
        for (int i = 0; i < segments; i++)
        {
            for (int j = 0; j <= resolution; j++)
            {
                float t = (float)j / resolution;
                Vector3 position = spline.GetPointOnSegment(i, t);
                Vector3 tangent = spline.GetTangentOnSegment(i, t).normalized;
                Vector3 normal = GetNormal(tangent);
                Vector3 binormal = Vector3.Cross(tangent, normal).normalized;
                
                CrossSection crossSection = new CrossSection
                {
                    position = position,
                    tangent = tangent,
                    normal = normal,
                    binormal = binormal
                };
                
                crossSections.Add(crossSection);
            }
        }
        
        // 生成轨道顶面
        GenerateTrackSurface(crossSections, vertices, triangles, normals, uvs, true);
        
        // 生成轨道底面
        GenerateTrackSurface(crossSections, vertices, triangles, normals, uvs, false);
        
        // 生成轨道侧面
        GenerateTrackSides(crossSections, vertices, triangles, normals, uvs);
    }
    
    /// <summary>
    /// 生成轨道表面（顶面或底面）
    /// </summary>
    private void GenerateTrackSurface(List<CrossSection> crossSections, List<Vector3> vertices, 
        List<int> triangles, List<Vector3> normals, List<Vector2> uvs, bool isTop)
    {
        int startIndex = vertices.Count;
        float yOffset = isTop ? trackHeight : 0f;
        Vector3 surfaceNormal = isTop ? Vector3.up : Vector3.down;
        
        // 生成顶点
        for (int i = 0; i < crossSections.Count; i++)
        {
            CrossSection cs = crossSections[i];
            
            for (int j = 0; j <= this.crossSections; j++)
            {
                float u = (float)j / this.crossSections;
                float x = (u - 0.5f) * trackWidth;
                
                Vector3 vertex = cs.position + cs.binormal * x + cs.normal * yOffset;
                vertices.Add(vertex);
                normals.Add(surfaceNormal);
                uvs.Add(new Vector2(u, (float)i / crossSections.Count));
            }
        }
        
        // 生成三角形
        for (int i = 0; i < crossSections.Count - 1; i++)
        {
            for (int j = 0; j < this.crossSections; j++)
            {
                int current = startIndex + i * (this.crossSections + 1) + j;
                int next = startIndex + (i + 1) * (this.crossSections + 1) + j;
                
                if (isTop)
                {
                    triangles.Add(current);
                    triangles.Add(next);
                    triangles.Add(current + 1);
                    
                    triangles.Add(current + 1);
                    triangles.Add(next);
                    triangles.Add(next + 1);
                }
                else
                {
                    triangles.Add(current);
                    triangles.Add(current + 1);
                    triangles.Add(next);
                    
                    triangles.Add(current + 1);
                    triangles.Add(next + 1);
                    triangles.Add(next);
                }
            }
        }
    }
    
    /// <summary>
    /// 生成轨道侧面
    /// </summary>
    private void GenerateTrackSides(List<CrossSection> crossSections, List<Vector3> vertices, 
        List<int> triangles, List<Vector3> normals, List<Vector2> uvs)
    {
        int startIndex = vertices.Count;
        
        // 左右两侧
        for (int side = 0; side < 2; side++)
        {
            float xOffset = (side == 0) ? -trackWidth * 0.5f : trackWidth * 0.5f;
            Vector3 sideNormal = (side == 0) ? Vector3.left : Vector3.right;
            
            // 生成顶点
            for (int i = 0; i < crossSections.Count; i++)
            {
                CrossSection cs = crossSections[i];
                
                // 底部顶点
                Vector3 bottomVertex = cs.position + cs.binormal * xOffset;
                vertices.Add(bottomVertex);
                normals.Add(sideNormal);
                uvs.Add(new Vector2(0, (float)i / crossSections.Count));
                
                // 顶部顶点
                Vector3 topVertex = cs.position + cs.binormal * xOffset + cs.normal * trackHeight;
                vertices.Add(topVertex);
                normals.Add(sideNormal);
                uvs.Add(new Vector2(1, (float)i / crossSections.Count));
            }
            
            // 生成三角形
            int sideStartIndex = startIndex + side * crossSections.Count * 2;
            for (int i = 0; i < crossSections.Count - 1; i++)
            {
                int currentBottom = sideStartIndex + i * 2;
                int currentTop = sideStartIndex + i * 2 + 1;
                int nextBottom = sideStartIndex + (i + 1) * 2;
                int nextTop = sideStartIndex + (i + 1) * 2 + 1;
                
                if (side == 0)
                {
                    // 左侧面
                    triangles.Add(currentBottom);
                    triangles.Add(currentTop);
                    triangles.Add(nextBottom);
                    
                    triangles.Add(currentTop);
                    triangles.Add(nextTop);
                    triangles.Add(nextBottom);
                }
                else
                {
                    // 右侧面
                    triangles.Add(currentBottom);
                    triangles.Add(nextBottom);
                    triangles.Add(currentTop);
                    
                    triangles.Add(currentTop);
                    triangles.Add(nextBottom);
                    triangles.Add(nextTop);
                }
            }
        }
    }
    
    /// <summary>
    /// 生成护栏
    /// </summary>
    private void GenerateRails(List<Vector3> vertices, List<int> triangles, List<Vector3> normals, List<Vector2> uvs)
    {
        int segments = spline.SegmentCount;
        List<CrossSection> crossSections = new List<CrossSection>();
        
        for (int i = 0; i < segments; i++)
        {
            for (int j = 0; j <= resolution; j++)
            {
                float t = (float)j / resolution;
                Vector3 position = spline.GetPointOnSegment(i, t);
                Vector3 tangent = spline.GetTangentOnSegment(i, t).normalized;
                Vector3 normal = GetNormal(tangent);
                Vector3 binormal = Vector3.Cross(tangent, normal).normalized;
                
                CrossSection crossSection = new CrossSection
                {
                    position = position,
                    tangent = tangent,
                    normal = normal,
                    binormal = binormal
                };
                
                crossSections.Add(crossSection);
            }
        }
        
        // 左右两侧护栏
        for (int side = 0; side < 2; side++)
        {
            float xOffset = (side == 0) ? -trackWidth * 0.5f : trackWidth * 0.5f;
            float yOffset = trackHeight;
            
            GenerateRail(crossSections, vertices, triangles, normals, uvs, xOffset, yOffset);
        }
    }
    
    /// <summary>
    /// 生成单侧护栏
    /// </summary>
    private void GenerateRail(List<CrossSection> crossSections, List<Vector3> vertices, 
        List<int> triangles, List<Vector3> normals, List<Vector2> uvs, float xOffset, float yOffset)
    {
        int startIndex = vertices.Count;
        
        // 生成护栏柱和横杆
        for (int i = 0; i < crossSections.Count; i += 5) // 每5个点生成一个护栏柱
        {
            CrossSection cs = crossSections[i];
            
            Vector3 basePos = cs.position + cs.binormal * xOffset + cs.normal * yOffset;
            Vector3 topPos = basePos + cs.normal * railHeight;
            
            // 护栏柱（简单的立方体）
            float halfThickness = railThickness * 0.5f;
            
            // 底部四个角
            vertices.Add(basePos + cs.binormal * -halfThickness + cs.tangent * -halfThickness);
            vertices.Add(basePos + cs.binormal * halfThickness + cs.tangent * -halfThickness);
            vertices.Add(basePos + cs.binormal * halfThickness + cs.tangent * halfThickness);
            vertices.Add(basePos + cs.binormal * -halfThickness + cs.tangent * halfThickness);
            
            // 顶部四个角
            vertices.Add(topPos + cs.binormal * -halfThickness + cs.tangent * -halfThickness);
            vertices.Add(topPos + cs.binormal * halfThickness + cs.tangent * -halfThickness);
            vertices.Add(topPos + cs.binormal * halfThickness + cs.tangent * halfThickness);
            vertices.Add(topPos + cs.binormal * -halfThickness + cs.tangent * halfThickness);
            
            // 添加法线和UV
            for (int j = 0; j < 8; j++)
            {
                normals.Add(cs.normal);
                uvs.Add(new Vector2(0, 0));
            }
            
            // 生成立方体的三角形（简化版，只生成前面和后面）
            int baseIdx = startIndex + (i / 5) * 8;
            
            // 前面
            triangles.Add(baseIdx);
            triangles.Add(baseIdx + 1);
            triangles.Add(baseIdx + 4);
            triangles.Add(baseIdx + 1);
            triangles.Add(baseIdx + 5);
            triangles.Add(baseIdx + 4);
            
            // 后面
            triangles.Add(baseIdx + 2);
            triangles.Add(baseIdx + 3);
            triangles.Add(baseIdx + 6);
            triangles.Add(baseIdx + 3);
            triangles.Add(baseIdx + 7);
            triangles.Add(baseIdx + 6);
        }
    }
    
    /// <summary>
    /// 获取法线方向（垂直于切线）
    /// </summary>
    private Vector3 GetNormal(Vector3 tangent)
    {
        // 使用世界空间的up方向作为参考
        Vector3 up = Vector3.up;
        Vector3 right = Vector3.Cross(up, tangent).normalized;
        
        if (right.magnitude < 0.1f)
        {
            // 如果切线几乎平行于up方向，使用forward作为参考
            up = Vector3.forward;
            right = Vector3.Cross(up, tangent).normalized;
        }
        
        return Vector3.Cross(tangent, right).normalized;
    }
    
    /// <summary>
    /// 横截面数据结构
    /// </summary>
    private struct CrossSection
    {
        public Vector3 position;
        public Vector3 tangent;
        public Vector3 normal;
        public Vector3 binormal;
    }
}

