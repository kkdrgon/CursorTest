#!/usr/bin/env python3
# -*- coding: utf-8 -*-

try:
    from PIL import Image, ImageDraw, ImageFont
    import os
except ImportError:
    print("请先安装Pillow库: pip install Pillow")
    exit(1)

def generate_beauty_image():
    """生成美女图片"""
    width, height = 800, 800
    
    # 创建图片
    img = Image.new('RGB', (width, height), color='#FFE4E1')
    draw = ImageDraw.Draw(img)
    
    # 绘制背景渐变（使用矩形模拟）
    for i in range(height):
        ratio = i / height
        r = int(255 * (1 - ratio * 0.2))
        g = int(182 * (1 - ratio * 0.1))
        b = int(193 * (1 - ratio * 0.1))
        draw.rectangle([(0, i), (width, i+1)], fill=(r, g, b))
    
    # 绘制头发
    draw.ellipse([width//2 - 120, height*3//10 - 60, width//2 + 120, height*3//10 + 60], 
                 fill='#8B4513', outline='#654321', width=2)
    
    # 绘制头部（圆形脸）
    draw.ellipse([width//2 - 100, height*3//10 - 20, width//2 + 100, height*3//10 + 180], 
                 fill='#FFDBB3', outline='#D4A574', width=2)
    
    # 绘制眉毛
    draw.arc([width//2 - 50, height*3//10 - 10, width//2 - 10, height*3//10 + 10], 
             180, 0, fill='#654321', width=4)
    draw.arc([width//2 + 10, height*3//10 - 10, width//2 + 50, height*3//10 + 10], 
             180, 0, fill='#654321', width=4)
    
    # 绘制眼睛
    draw.ellipse([width//2 - 38, height*3//10 + 20, width//2 - 22, height*3//10 + 36], 
                 fill='#000000')
    draw.ellipse([width//2 + 22, height*3//10 + 20, width//2 + 38, height*3//10 + 36], 
                 fill='#000000')
    
    # 绘制鼻子
    draw.line([(width//2, height*3//10 + 55), (width//2, height*3//10 + 75)], 
              fill='#D4A574', width=2)
    
    # 绘制嘴巴（微笑）
    draw.arc([width//2 - 20, height*3//10 + 75, width//2 + 20, height*3//10 + 115], 
             0, 180, fill='#FF69B4', width=3)
    
    # 绘制身体（裙子）
    points = [
        (width//2 - 80, height*2//5),
        (width//2 + 80, height*2//5),
        (width//2 + 100, height*7//10),
        (width//2 - 100, height*7//10)
    ]
    draw.polygon(points, fill='#FF69B4', outline='#FF1493')
    
    # 绘制装饰（圆形装饰）
    draw.ellipse([width//2 - 55, height//2 - 15, width//2 - 25, height//2 + 15], 
                 fill='#FF1493')
    draw.ellipse([width//2 + 25, height//2 - 15, width//2 + 55, height//2 + 15], 
                 fill='#FF1493')
    
    # 添加文字
    try:
        font = ImageFont.truetype("arial.ttf", 40)
    except:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 40)
        except:
            font = ImageFont.load_default()
    
    bbox = draw.textbbox((0, 0), '美女', font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    draw.text((width//2 - text_width//2, height*17//20 - text_height//2), 
              '美女', fill='#000000', font=font)
    
    # 保存图片
    img.save('美女.png', 'PNG')
    print(f'已生成: {os.path.abspath("美女.png")}')

def generate_robot_image():
    """生成机器人图片"""
    width, height = 800, 800
    
    # 创建图片
    img = Image.new('RGB', (width, height), color='#C0C0C0')
    draw = ImageDraw.Draw(img)
    
    # 绘制背景渐变
    for i in range(height):
        ratio = i / height
        r = int(112 + ratio * 128)
        g = int(128 + ratio * 128)
        b = int(144 + ratio * 112)
        draw.rectangle([(0, i), (width, i+1)], fill=(r, g, b))
    
    # 绘制头部（方形）
    draw.rectangle([width//2 - 100, height*3//20, width//2 + 100, height*3//20 + 150], 
                   fill='#C0C0C0', outline='#808080', width=4)
    
    # 绘制眼睛（LED灯）
    draw.ellipse([width//2 - 55, height*3//20 + 60, width//2 - 25, height*3//20 + 90], 
                 fill='#00FF00', outline='#008000', width=2)
    draw.ellipse([width//2 + 25, height*3//20 + 60, width//2 + 55, height*3//20 + 90], 
                 fill='#00FF00', outline='#008000', width=2)
    # 眼睛高光
    draw.ellipse([width//2 - 50, height*3//20 + 65, width//2 - 40, height*3//20 + 75], 
                 fill='#FFFFFF')
    draw.ellipse([width//2 + 40, height*3//20 + 65, width//2 + 50, height*3//20 + 75], 
                 fill='#FFFFFF')
    
    # 绘制嘴巴（LED显示屏）
    draw.rectangle([width//2 - 50, height*3//20 + 120, width//2 + 50, height*3//20 + 140], 
                   fill='#FF0000', outline='#800000', width=2)
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
        except:
            font = ImageFont.load_default()
    draw.text((width//2 - 20, height*3//20 + 125), '===', fill='#FFFF00', font=font)
    
    # 绘制天线
    draw.line([(width//2 - 30, height*3//20), (width//2 - 40, height//20)], 
              fill='#808080', width=3)
    draw.ellipse([width//2 - 45, height//20 - 5, width//2 - 35, height//20 + 5], 
                 fill='#FF0000')
    
    # 绘制身体（矩形）
    draw.rectangle([width//2 - 120, height*7//20, width//2 + 120, height*7//20 + 200], 
                   fill='#A0A0A0', outline='#606060', width=4)
    
    # 绘制胸部面板
    draw.rectangle([width//2 - 80, height*9//20, width//2 + 80, height*9//20 + 100], 
                   fill='#808080', outline='#404040', width=2)
    
    # 绘制按钮
    draw.ellipse([width//2 - 38, height*11//20 - 8, width//2 - 22, height*11//20 + 8], 
                 fill='#0000FF')
    draw.ellipse([width//2 - 8, height*11//20 - 8, width//2 + 8, height*11//20 + 8], 
                 fill='#0000FF')
    draw.ellipse([width//2 + 22, height*11//20 - 8, width//2 + 38, height*11//20 + 8], 
                 fill='#0000FF')
    
    # 绘制左臂
    draw.rectangle([width//2 - 140, height*2//5, width//2 - 110, height*2//5 + 100], 
                   fill='#B0B0B0', outline='#808080', width=2)
    draw.rectangle([width//2 - 150, height*9//20, width//2 - 130, height*9//20 + 20], 
                   fill='#B0B0B0', outline='#606060', width=2)
    # 左手（夹子）
    draw.line([(width//2 - 130, height//2), (width//2 - 145, height//2 + 12)], 
              fill='#606060', width=4)
    draw.line([(width//2 - 155, height//2), (width//2 - 145, height//2 + 12)], 
              fill='#606060', width=4)
    draw.line([(width//2 - 130, height//2), (width//2 - 145, height//2 - 12)], 
              fill='#606060', width=4)
    draw.line([(width//2 - 155, height//2), (width//2 - 145, height//2 - 12)], 
              fill='#606060', width=4)
    
    # 绘制右臂
    draw.rectangle([width//2 + 110, height*2//5, width//2 + 140, height*2//5 + 100], 
                   fill='#B0B0B0', outline='#808080', width=2)
    draw.rectangle([width//2 + 130, height*9//20, width//2 + 150, height*9//20 + 20], 
                   fill='#B0B0B0', outline='#606060', width=2)
    # 右手（夹子）
    draw.line([(width//2 + 130, height//2), (width//2 + 145, height//2 + 12)], 
              fill='#606060', width=4)
    draw.line([(width//2 + 155, height//2), (width//2 + 145, height//2 + 12)], 
              fill='#606060', width=4)
    draw.line([(width//2 + 130, height//2), (width//2 + 145, height//2 - 12)], 
              fill='#606060', width=4)
    draw.line([(width//2 + 155, height//2), (width//2 + 145, height//2 - 12)], 
              fill='#606060', width=4)
    
    # 绘制腿部
    draw.rectangle([width//2 - 60, height*11//20, width//2 - 20, height*11//20 + 150], 
                   fill='#909090', outline='#707070', width=2)
    draw.rectangle([width//2 + 20, height*11//20, width//2 + 60, height*11//20 + 150], 
                   fill='#909090', outline='#707070', width=2)
    
    # 绘制脚
    draw.rectangle([width//2 - 70, height*7//10, width//2 - 10, height*7//10 + 30], 
                   fill='#707070', outline='#505050', width=2)
    draw.rectangle([width//2 + 10, height*7//10, width//2 + 70, height*7//10 + 30], 
                   fill='#707070', outline='#505050', width=2)
    
    # 添加文字
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 40)
    except:
        try:
            font = ImageFont.truetype("arial.ttf", 40)
        except:
            font = ImageFont.load_default()
    
    bbox = draw.textbbox((0, 0), '机器人', font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    # 文字描边效果
    for dx in [-2, -1, 0, 1, 2]:
        for dy in [-2, -1, 0, 1, 2]:
            if dx != 0 or dy != 0:
                draw.text((width//2 - text_width//2 + dx, height*9//10 - text_height//2 + dy), 
                          '机器人', fill='#000000', font=font)
    draw.text((width//2 - text_width//2, height*9//10 - text_height//2), 
              '机器人', fill='#FFFFFF', font=font)
    
    # 保存图片
    img.save('机器人.png', 'PNG')
    print(f'已生成: {os.path.abspath("机器人.png")}')

if __name__ == '__main__':
    print('开始生成PNG图片...')
    try:
        generate_beauty_image()
        generate_robot_image()
        print('所有PNG图片生成完成！')
    except Exception as e:
        print(f'生成图片时出错: {e}')
        import traceback
        traceback.print_exc()

