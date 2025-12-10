using UnityEngine;
using UnityEditor;

/// <summary>
/// BezierSpline的Inspector自定义编辑器
/// </summary>
[CustomEditor(typeof(BezierSpline))]
[CanEditMultipleObjects]
public class BezierSplineInspector : Editor
{
    private BezierSpline spline;
    
    private void OnEnable()
    {
        spline = (BezierSpline)target;
    }
    
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();
        
        EditorGUILayout.Space();
        EditorGUILayout.LabelField("曲线信息", EditorStyles.boldLabel);
        EditorGUILayout.LabelField($"控制点数量: {spline.PointCount}");
        EditorGUILayout.LabelField($"曲线段数: {spline.SegmentCount}");
        EditorGUILayout.LabelField($"是否闭合: {spline.IsClosed}");
        
        if (Application.isPlaying)
        {
            EditorGUILayout.LabelField($"近似长度: {spline.GetApproximateLength():F2}");
        }
    }
}

