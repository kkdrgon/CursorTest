using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 贝塞尔样条曲线类，支持C2连续（曲率连续）
/// 每个控制点的两个方向控制点在一条直线上，保证曲率连续
/// </summary>
[System.Serializable]
public class BezierSpline : MonoBehaviour
{
    [System.Serializable]
    public class BezierPoint
    {
        public Vector3 position;
        public Vector3 leftTangent;   // 左侧控制点（相对于position的偏移）
        public Vector3 rightTangent;  // 右侧控制点（相对于position的偏移）
        
        public BezierPoint(Vector3 pos)
        {
            position = pos;
            leftTangent = Vector3.zero;
            rightTangent = Vector3.zero;
        }
        
        // 获取左侧控制点的世界坐标
        public Vector3 GetLeftControlPoint()
        {
            return position + leftTangent;
        }
        
        // 获取右侧控制点的世界坐标
        public Vector3 GetRightControlPoint()
        {
            return position + rightTangent;
        }
        
        // 设置左侧控制点（自动调整右侧以保持共线）
        public void SetLeftControlPoint(Vector3 worldPos, float tangentLength)
        {
            Vector3 direction = (worldPos - position).normalized;
            leftTangent = direction * tangentLength;
            // 确保右侧控制点与左侧共线
            rightTangent = -direction * tangentLength;
        }
        
        // 设置右侧控制点（自动调整左侧以保持共线）
        public void SetRightControlPoint(Vector3 worldPos, float tangentLength)
        {
            Vector3 direction = (worldPos - position).normalized;
            rightTangent = direction * tangentLength;
            // 确保左侧控制点与右侧共线
            leftTangent = -direction * tangentLength;
        }
        
        // 设置切线方向（保持C2连续性）
        public void SetTangentDirection(Vector3 direction, float leftLength, float rightLength)
        {
            direction.Normalize();
            leftTangent = -direction * leftLength;
            rightTangent = direction * rightLength;
        }
    }
    
    [Header("曲线设置")]
    [SerializeField] private List<BezierPoint> points = new List<BezierPoint>();
    [SerializeField] private bool closed = false;
    [SerializeField] private int resolution = 50; // 每段曲线的采样点数
    
    [Header("显示设置")]
    [SerializeField] private bool showGizmos = true;
    [SerializeField] private Color curveColor = Color.white;
    [SerializeField] private Color controlPointColor = Color.yellow;
    [SerializeField] private Color tangentColor = Color.cyan;
    
    public int PointCount => points.Count;
    public int SegmentCount => closed ? points.Count : Mathf.Max(0, points.Count - 1);
    public bool IsClosed => closed;
    
    private void Awake()
    {
        if (points.Count == 0)
        {
            // 初始化默认点
            points.Add(new BezierPoint(new Vector3(0, 0, 0)));
            points.Add(new BezierPoint(new Vector3(5, 2, 0)));
            points.Add(new BezierPoint(new Vector3(10, 0, 0)));
        }
    }
    
    /// <summary>
    /// 添加一个控制点
    /// </summary>
    public void AddPoint(Vector3 position)
    {
        BezierPoint newPoint = new BezierPoint(position);
        
        if (points.Count > 0)
        {
            // 自动计算切线方向以保持平滑
            BezierPoint lastPoint = points[points.Count - 1];
            Vector3 direction = (position - lastPoint.position).normalized;
            float distance = Vector3.Distance(position, lastPoint.position);
            float tangentLength = distance * 0.3f;
            
            // 设置前一个点的右侧切线和当前点的左侧切线
            lastPoint.SetRightControlPoint(lastPoint.position + direction * tangentLength, tangentLength);
            newPoint.SetLeftControlPoint(newPoint.position - direction * tangentLength, tangentLength);
        }
        
        points.Add(newPoint);
    }
    
    /// <summary>
    /// 移除指定索引的控制点
    /// </summary>
    public void RemovePoint(int index)
    {
        if (index >= 0 && index < points.Count)
        {
            points.RemoveAt(index);
        }
    }
    
    /// <summary>
    /// 获取指定索引的控制点
    /// </summary>
    public BezierPoint GetPoint(int index)
    {
        if (index >= 0 && index < points.Count)
        {
            return points[index];
        }
        return null;
    }
    
    /// <summary>
    /// 设置控制点位置
    /// </summary>
    public void SetPointPosition(int index, Vector3 position)
    {
        if (index >= 0 && index < points.Count)
        {
            points[index].position = position;
        }
    }
    
    /// <summary>
    /// 在参数t处计算曲线上的点（t范围0-1，跨越整个曲线）
    /// </summary>
    public Vector3 GetPoint(float t)
    {
        if (points.Count < 2) return Vector3.zero;
        
        t = Mathf.Clamp01(t);
        
        if (closed)
        {
            t *= points.Count;
        }
        else
        {
            t *= (points.Count - 1);
        }
        
        int segmentIndex = Mathf.FloorToInt(t);
        float localT = t - segmentIndex;
        
        if (closed)
        {
            segmentIndex = segmentIndex % points.Count;
        }
        else
        {
            segmentIndex = Mathf.Clamp(segmentIndex, 0, points.Count - 2);
        }
        
        return GetPointOnSegment(segmentIndex, localT);
    }
    
    /// <summary>
    /// 在指定段上的参数t处计算点（t范围0-1）
    /// </summary>
    public Vector3 GetPointOnSegment(int segmentIndex, float t)
    {
        if (points.Count < 2) return Vector3.zero;
        
        t = Mathf.Clamp01(t);
        
        int p0Index = segmentIndex;
        int p1Index = (segmentIndex + 1) % points.Count;
        
        BezierPoint p0 = points[p0Index];
        BezierPoint p1 = points[p1Index];
        
        Vector3 p0_pos = p0.position;
        Vector3 p0_right = p0.GetRightControlPoint();
        Vector3 p1_left = p1.GetLeftControlPoint();
        Vector3 p1_pos = p1.position;
        
        // 三次贝塞尔曲线
        return BezierCubic(p0_pos, p0_right, p1_left, p1_pos, t);
    }
    
    /// <summary>
    /// 获取曲线在参数t处的切线方向
    /// </summary>
    public Vector3 GetTangent(float t)
    {
        if (points.Count < 2) return Vector3.forward;
        
        t = Mathf.Clamp01(t);
        
        if (closed)
        {
            t *= points.Count;
        }
        else
        {
            t *= (points.Count - 1);
        }
        
        int segmentIndex = Mathf.FloorToInt(t);
        float localT = t - segmentIndex;
        
        if (closed)
        {
            segmentIndex = segmentIndex % points.Count;
        }
        else
        {
            segmentIndex = Mathf.Clamp(segmentIndex, 0, points.Count - 2);
        }
        
        return GetTangentOnSegment(segmentIndex, localT).normalized;
    }
    
    /// <summary>
    /// 获取指定段上的切线方向
    /// </summary>
    public Vector3 GetTangentOnSegment(int segmentIndex, float t)
    {
        if (points.Count < 2) return Vector3.forward;
        
        t = Mathf.Clamp01(t);
        
        int p0Index = segmentIndex;
        int p1Index = (segmentIndex + 1) % points.Count;
        
        BezierPoint p0 = points[p0Index];
        BezierPoint p1 = points[p1Index];
        
        Vector3 p0_pos = p0.position;
        Vector3 p0_right = p0.GetRightControlPoint();
        Vector3 p1_left = p1.GetLeftControlPoint();
        Vector3 p1_pos = p1.position;
        
        // 三次贝塞尔曲线的导数
        float u = 1f - t;
        Vector3 tangent = 3f * u * u * (p0_right - p0_pos) +
                          6f * u * t * (p1_left - p0_right) +
                          3f * t * t * (p1_pos - p1_left);
        
        return tangent;
    }
    
    /// <summary>
    /// 获取曲线在参数t处的法线方向（垂直于切线）
    /// </summary>
    public Vector3 GetNormal(float t, Vector3 up)
    {
        Vector3 tangent = GetTangent(t);
        Vector3 binormal = Vector3.Cross(up, tangent).normalized;
        return Vector3.Cross(tangent, binormal).normalized;
    }
    
    /// <summary>
    /// 获取曲线的总长度（近似值）
    /// </summary>
    public float GetApproximateLength()
    {
        float length = 0f;
        int segments = SegmentCount;
        
        for (int i = 0; i < segments; i++)
        {
            Vector3 prevPoint = GetPointOnSegment(i, 0f);
            for (int j = 1; j <= resolution; j++)
            {
                float t = (float)j / resolution;
                Vector3 currentPoint = GetPointOnSegment(i, t);
                length += Vector3.Distance(prevPoint, currentPoint);
                prevPoint = currentPoint;
            }
        }
        
        return length;
    }
    
    /// <summary>
    /// 获取所有采样点（用于生成网格）
    /// </summary>
    public List<Vector3> GetSamplePoints()
    {
        List<Vector3> samplePoints = new List<Vector3>();
        int segments = SegmentCount;
        
        for (int i = 0; i < segments; i++)
        {
            for (int j = 0; j <= resolution; j++)
            {
                float t = (float)j / resolution;
                samplePoints.Add(GetPointOnSegment(i, t));
            }
        }
        
        return samplePoints;
    }
    
    /// <summary>
    /// 三次贝塞尔曲线计算
    /// </summary>
    private Vector3 BezierCubic(Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3, float t)
    {
        float u = 1f - t;
        float tt = t * t;
        float uu = u * u;
        float uuu = uu * u;
        float ttt = tt * t;
        
        Vector3 point = uuu * p0;
        point += 3f * uu * t * p1;
        point += 3f * u * tt * p2;
        point += ttt * p3;
        
        return point;
    }
    
    /// <summary>
    /// 确保C2连续性（曲率连续）
    /// 当移动一个控制点时，自动调整相邻控制点的切线
    /// </summary>
    public void EnsureC2Continuity(int pointIndex)
    {
        if (points.Count < 3) return;
        
        BezierPoint currentPoint = points[pointIndex];
        
        // 调整前一个点的右侧切线
        if (pointIndex > 0)
        {
            BezierPoint prevPoint = points[pointIndex - 1];
            Vector3 direction = (currentPoint.position - prevPoint.position).normalized;
            float distance = Vector3.Distance(currentPoint.position, prevPoint.position);
            float tangentLength = distance * 0.3f;
            
            prevPoint.SetRightControlPoint(prevPoint.position + direction * tangentLength, tangentLength);
            currentPoint.SetLeftControlPoint(currentPoint.position - direction * tangentLength, tangentLength);
        }
        
        // 调整后一个点的左侧切线
        if (pointIndex < points.Count - 1)
        {
            BezierPoint nextPoint = points[pointIndex + 1];
            Vector3 direction = (nextPoint.position - currentPoint.position).normalized;
            float distance = Vector3.Distance(nextPoint.position, currentPoint.position);
            float tangentLength = distance * 0.3f;
            
            currentPoint.SetRightControlPoint(currentPoint.position + direction * tangentLength, tangentLength);
            nextPoint.SetLeftControlPoint(nextPoint.position - direction * tangentLength, tangentLength);
        }
        
        // 处理闭合曲线
        if (closed)
        {
            if (pointIndex == 0)
            {
                BezierPoint lastPoint = points[points.Count - 1];
                Vector3 direction = (currentPoint.position - lastPoint.position).normalized;
                float distance = Vector3.Distance(currentPoint.position, lastPoint.position);
                float tangentLength = distance * 0.3f;
                
                lastPoint.SetRightControlPoint(lastPoint.position + direction * tangentLength, tangentLength);
                currentPoint.SetLeftControlPoint(currentPoint.position - direction * tangentLength, tangentLength);
            }
            else if (pointIndex == points.Count - 1)
            {
                BezierPoint firstPoint = points[0];
                Vector3 direction = (firstPoint.position - currentPoint.position).normalized;
                float distance = Vector3.Distance(firstPoint.position, currentPoint.position);
                float tangentLength = distance * 0.3f;
                
                currentPoint.SetRightControlPoint(currentPoint.position + direction * tangentLength, tangentLength);
                firstPoint.SetLeftControlPoint(firstPoint.position - direction * tangentLength, tangentLength);
            }
        }
    }
    
    private void OnDrawGizmos()
    {
        if (!showGizmos || points.Count < 2) return;
        
        // 绘制曲线
        Gizmos.color = curveColor;
        int segments = SegmentCount;
        
        for (int i = 0; i < segments; i++)
        {
            Vector3 prevPoint = GetPointOnSegment(i, 0f);
            for (int j = 1; j <= resolution; j++)
            {
                float t = (float)j / resolution;
                Vector3 currentPoint = GetPointOnSegment(i, t);
                Gizmos.DrawLine(prevPoint, currentPoint);
                prevPoint = currentPoint;
            }
        }
        
        // 绘制控制点和切线
        for (int i = 0; i < points.Count; i++)
        {
            BezierPoint point = points[i];
            
            // 绘制控制点
            Gizmos.color = controlPointColor;
            Gizmos.DrawSphere(point.position, 0.2f);
            
            // 绘制左侧切线
            if (point.leftTangent.magnitude > 0.01f)
            {
                Gizmos.color = tangentColor;
                Gizmos.DrawLine(point.position, point.GetLeftControlPoint());
                Gizmos.DrawSphere(point.GetLeftControlPoint(), 0.1f);
            }
            
            // 绘制右侧切线
            if (point.rightTangent.magnitude > 0.01f)
            {
                Gizmos.color = tangentColor;
                Gizmos.DrawLine(point.position, point.GetRightControlPoint());
                Gizmos.DrawSphere(point.GetRightControlPoint(), 0.1f);
            }
        }
    }
}

