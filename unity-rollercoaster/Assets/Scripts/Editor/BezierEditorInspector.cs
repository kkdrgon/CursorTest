using UnityEngine;
using UnityEditor;

/// <summary>
/// BezierEditor的Inspector自定义编辑器
/// </summary>
[CustomEditor(typeof(BezierEditor))]
[CanEditMultipleObjects]
public class BezierEditorInspector : Editor
{
    private BezierEditor bezierEditor;
    private BezierSpline spline;
    
    private void OnEnable()
    {
        bezierEditor = (BezierEditor)target;
        spline = bezierEditor.GetComponent<BezierSpline>();
    }
    
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();
        
        if (spline == null)
        {
            EditorGUILayout.HelpBox("需要BezierSpline组件", MessageType.Warning);
            return;
        }
        
        EditorGUILayout.Space();
        EditorGUILayout.LabelField("曲线信息", EditorStyles.boldLabel);
        EditorGUILayout.LabelField($"控制点数量: {spline.PointCount}");
        EditorGUILayout.LabelField($"曲线段数: {spline.SegmentCount}");
        EditorGUILayout.LabelField($"是否闭合: {spline.IsClosed}");
        EditorGUILayout.LabelField($"近似长度: {spline.GetApproximateLength():F2}");
        
        EditorGUILayout.Space();
        EditorGUILayout.LabelField("操作", EditorStyles.boldLabel);
        
        if (GUILayout.Button("添加控制点"))
        {
            Vector3 newPos = Vector3.zero;
            if (spline.PointCount > 0)
            {
                BezierSpline.BezierPoint lastPoint = spline.GetPoint(spline.PointCount - 1);
                newPos = lastPoint.position + Vector3.forward * 5f;
            }
            spline.AddPoint(newPos);
        }
        
        if (GUILayout.Button("生成轨道"))
        {
            TrackGenerator trackGenerator = bezierEditor.GetComponent<TrackGenerator>();
            if (trackGenerator != null)
            {
                trackGenerator.GenerateTrack();
            }
        }
        
        EditorGUILayout.Space();
        EditorGUILayout.HelpBox("在场景视图中:\n- 点击控制点进行选择\n- 拖动控制点移动位置\n- 拖动切线控制点调整曲线形状\n- 按A键添加新点\n- 按Delete键删除选中点", MessageType.Info);
    }
}

