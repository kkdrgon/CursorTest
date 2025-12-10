using UnityEngine;

#if UNITY_EDITOR
using UnityEditor;
#endif

/// <summary>
/// 贝塞尔曲线编辑器，提供场景视图中的交互式编辑功能
/// </summary>
[RequireComponent(typeof(BezierSpline))]
public class BezierEditor : MonoBehaviour
{
    private BezierSpline spline;
    private int selectedPointIndex = -1;
    private bool isEditingTangent = false;
    private bool isLeftTangent = false;
    
    [Header("编辑设置")]
    [SerializeField] private float handleSize = 0.3f;
    [SerializeField] private float tangentHandleSize = 0.2f;
    [SerializeField] private KeyCode addPointKey = KeyCode.A;
    [SerializeField] private KeyCode deletePointKey = KeyCode.Delete;
    
    private void Awake()
    {
        spline = GetComponent<BezierSpline>();
    }
    
#if UNITY_EDITOR
    private void OnSceneGUI()
    {
        if (spline == null) return;
        
        Event e = Event.current;
        
        // 处理键盘输入
        if (e.type == EventType.KeyDown)
        {
            if (e.keyCode == addPointKey && selectedPointIndex >= 0)
            {
                // 在选中点后添加新点
                Vector3 newPos = spline.GetPoint(selectedPointIndex).position + Vector3.forward * 5f;
                spline.AddPoint(newPos);
                selectedPointIndex = spline.PointCount - 1;
                e.Use();
            }
            else if (e.keyCode == deletePointKey && selectedPointIndex >= 0 && spline.PointCount > 2)
            {
                spline.RemovePoint(selectedPointIndex);
                selectedPointIndex = Mathf.Clamp(selectedPointIndex, 0, spline.PointCount - 1);
                e.Use();
            }
        }
        
        // 绘制所有控制点
        for (int i = 0; i < spline.PointCount; i++)
        {
            BezierSpline.BezierPoint point = spline.GetPoint(i);
            
            // 绘制控制点
            Handles.color = (i == selectedPointIndex) ? Color.red : Color.yellow;
            Vector3 newPosition = Handles.PositionHandle(point.position, Quaternion.identity);
            
            if (newPosition != point.position)
            {
                Undo.RecordObject(spline, "Move Bezier Point");
                spline.SetPointPosition(i, newPosition);
                spline.EnsureC2Continuity(i);
                EditorUtility.SetDirty(spline);
            }
            
            // 绘制左侧切线控制点
            if (point.leftTangent.magnitude > 0.01f)
            {
                Vector3 leftControl = point.GetLeftControlPoint();
                Handles.color = Color.cyan;
                Vector3 newLeftControl = Handles.PositionHandle(leftControl, Quaternion.identity);
                
                if (newLeftControl != leftControl)
                {
                    Undo.RecordObject(spline, "Move Left Tangent");
                    float distance = Vector3.Distance(newLeftControl, point.position);
                    point.SetLeftControlPoint(newLeftControl, distance);
                    spline.EnsureC2Continuity(i);
                    EditorUtility.SetDirty(spline);
                }
            }
            
            // 绘制右侧切线控制点
            if (point.rightTangent.magnitude > 0.01f)
            {
                Vector3 rightControl = point.GetRightControlPoint();
                Handles.color = Color.cyan;
                Vector3 newRightControl = Handles.PositionHandle(rightControl, Quaternion.identity);
                
                if (newRightControl != rightControl)
                {
                    Undo.RecordObject(spline, "Move Right Tangent");
                    float distance = Vector3.Distance(newRightControl, point.position);
                    point.SetRightControlPoint(newRightControl, distance);
                    spline.EnsureC2Continuity(i);
                    EditorUtility.SetDirty(spline);
                }
            }
            
            // 检测点击选择
            if (e.type == EventType.MouseDown && e.button == 0)
            {
                float distance = HandleUtility.DistanceToCircle(point.position, handleSize);
                if (distance < 0.5f)
                {
                    selectedPointIndex = i;
                    e.Use();
                }
            }
        }
        
        // 绘制选中点的信息
        if (selectedPointIndex >= 0 && selectedPointIndex < spline.PointCount)
        {
            BezierSpline.BezierPoint selectedPoint = spline.GetPoint(selectedPointIndex);
            Handles.Label(selectedPoint.position + Vector3.up * 2f, 
                $"Point {selectedPointIndex}\n" +
                $"Position: {selectedPoint.position}\n" +
                $"Left Tangent: {selectedPoint.leftTangent}\n" +
                $"Right Tangent: {selectedPoint.rightTangent}");
        }
    }
#endif
    
    /// <summary>
    /// 在场景中点击位置添加新点
    /// </summary>
    public void AddPointAtPosition(Vector3 worldPosition)
    {
        if (spline == null) spline = GetComponent<BezierSpline>();
        spline.AddPoint(worldPosition);
    }
    
    /// <summary>
    /// 删除选中的点
    /// </summary>
    public void DeleteSelectedPoint()
    {
        if (selectedPointIndex >= 0 && spline.PointCount > 2)
        {
            spline.RemovePoint(selectedPointIndex);
            selectedPointIndex = Mathf.Clamp(selectedPointIndex, 0, spline.PointCount - 1);
        }
    }
}

