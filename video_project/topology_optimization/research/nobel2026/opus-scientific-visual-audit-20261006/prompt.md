Please conduct an INDEPENDENT, READ-ONLY scientific visual and audio-timing audit of a 2026 Nobel medicine optogenetics explainer. You cannot inspect pixels here: the supplied evidence is code, frame/voice timing, and extracted text from the official Nobel popular-information PDF. Do not claim to have viewed rendered frames, listened to audio, or verified actual rendering. Do not edit any files. Do not invoke tools. Return a concise Chinese audit with exact file:line references or clip IDs and frame ranges.

Check specifically: (1) factual/methodological claims against the official source, including ChR1 vs ChR2, 0.5/0.2 ms, oocyte heterologous expression, ion direction, 2003/2005/2007, memory sufficiency vs necessity, retinal clinical limits; (2) whether Three.js geometry and camera allow the narrated mechanism to be seen, especially membrane pore/ions/photons/brain fiber/control trace and possible occlusion; (3) whether visual events happen during the voice clip that introduces them, using actual timing and stateAt() + voiceStep math; (4) overlay collision and cut/transition risks by reasoning about positions, zIndex, clipping, camera orthographic extents and group travel; (5) evidence-card and endpaper accuracy/attribution. Prioritize substantive faults, with evidence and a feasible correction. Separate verified code-level findings from hypotheses requiring a rendered-frame/audio review. Do not assume a rendered frame exists in your context. The frozen NARRATION is the current approved spoken text: suggest wording changes as proposed editorial notes, not as implemented changes.

CURRENT TIMELINE (frames at 30 fps, actual caption part timings in seconds relative to each clip):
{
  "fps": 30,
  "durationFrames": 7213,
  "scenes": [
    {
      "id": "hook",
      "start": 0,
      "end": 668,
      "title": "hook"
    },
    {
      "id": "context",
      "start": 668,
      "end": 979,
      "title": "context"
    },
    {
      "id": "algae",
      "start": 979,
      "end": 2193,
      "title": "algae"
    },
    {
      "id": "channel",
      "start": 2193,
      "end": 3289,
      "title": "channel"
    },
    {
      "id": "neuron",
      "start": 3289,
      "end": 4431,
      "title": "neuron"
    },
    {
      "id": "brain",
      "start": 4431,
      "end": 5425,
      "title": "brain"
    },
    {
      "id": "impact",
      "start": 5425,
      "end": 6853,
      "title": "impact"
    },
    {
      "id": "references",
      "start": 6853,
      "end": 7213,
      "title": "证据与论文"
    }
  ],
  "clips": [
    {
      "id": "000",
      "scene": "hook",
      "start": 0,
      "end": 460,
      "spoken": "我们的大脑每天都在发号施令。抬手、转头、眨眼，看起来只是一个动作。可在实验室里，真正难的是：这一次动作，到底是哪一群细胞发起的？如果只叫醒一小群细胞，问题才有机会问清楚。",
      "subtitle": "我们的大脑每天都在发号施令。抬手、转头、眨眼，看起来只是一个动作。可在实验室里，真正难的是：这一次动作，到底是哪一群细胞发起的？如果只叫醒一小群细胞，问题才有机会问清楚。",
      "subtitleParts": [
        {
          "text": "我们的大脑每天都在发号施令。",
          "start": 0,
          "end": 2.22,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 13,
          "expectedChars": 13,
          "matchedRatio": 1,
          "confidence": 0.9164,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11
          ],
          "matchedWords": [
            "我们",
            "的",
            "大",
            "脑",
            "每",
            "天",
            "都",
            "在",
            "发",
            "号",
            "施",
            "令,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9164,
          "interpolatedWordUnits": true
        },
        {
          "text": "抬手、转头、眨眼，看起来只是一个动作。",
          "start": 2.5,
          "end": 5.88,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 15,
          "expectedChars": 15,
          "matchedRatio": 1,
          "confidence": 0.9835,
          "matchedWordIndexes": [
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22,
            23,
            24
          ],
          "matchedWords": [
            "抬",
            "手,",
            "转",
            "头,",
            "眨",
            "眼,",
            "看",
            "起",
            "来",
            "只是",
            "一个",
            "动",
            "作。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9835,
          "interpolatedWordUnits": true
        },
        {
          "text": "可在实验室里，真正难的是：",
          "start": 6.22,
          "end": 8.2,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 11,
          "expectedChars": 11,
          "matchedRatio": 1,
          "confidence": 0.9857,
          "matchedWordIndexes": [
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34
          ],
          "matchedWords": [
            "可",
            "在",
            "实",
            "验",
            "室",
            "里,",
            "真",
            "正",
            "难",
            "的是"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9857,
          "interpolatedWordUnits": true
        },
        {
          "text": "这一次动作，到底是哪一群细胞发起的？",
          "start": 8.2,
          "end": 10.92,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 16,
          "expectedChars": 16,
          "matchedRatio": 1,
          "confidence": 0.9596,
          "matchedWordIndexes": [
            35,
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            43,
            44,
            45,
            46,
            47,
            48
          ],
          "matchedWords": [
            "这",
            "一次",
            "动",
            "作",
            "到底",
            "是",
            "哪",
            "一",
            "群",
            "细",
            "胞",
            "发",
            "起",
            "的。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9596,
          "interpolatedWordUnits": true
        },
        {
          "text": "如果只叫醒一小群细胞，问题才有机会问清楚。",
          "start": 11.4,
          "end": 14.6,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 19,
          "expectedChars": 19,
          "matchedRatio": 1,
          "confidence": 0.9843,
          "matchedWordIndexes": [
            49,
            50,
            51,
            52,
            53,
            54,
            55,
            56,
            57,
            58,
            59,
            60,
            61,
            62,
            63,
            64
          ],
          "matchedWords": [
            "如果",
            "只",
            "叫",
            "醒",
            "一",
            "小",
            "群",
            "细",
            "胞,",
            "问题",
            "才",
            "有",
            "机",
            "会",
            "问",
            "清楚。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9843,
          "interpolatedWordUnits": true
        }
      ],
      "asrSpeechEnd": 14.6
    },
    {
      "id": "001",
      "scene": "hook",
      "start": 460,
      "end": 668,
      "spoken": "今年的诺贝尔生理学或医学奖，颁给三位科学家。他们的答案，都从一束光开始。",
      "subtitle": "今年的诺贝尔生理学或医学奖，颁给三位科学家。他们的答案，都从一束光开始。",
      "subtitleParts": [
        {
          "text": "今年的诺贝尔生理学或医学奖，颁给三位科学家。",
          "start": 0,
          "end": 3.74,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 20,
          "expectedChars": 20,
          "matchedRatio": 1,
          "confidence": 0.9309,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18
          ],
          "matchedWords": [
            "今",
            "年的",
            "諾",
            "貝",
            "爾",
            "生",
            "理",
            "學",
            "或",
            "醫",
            "學",
            "獎",
            "頒",
            "給",
            "三",
            "位",
            "科",
            "學",
            "家,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9309,
          "interpolatedWordUnits": true
        },
        {
          "text": "他们的答案，都从一束光开始。",
          "start": 4.12,
          "end": 6.22,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 12,
          "expectedChars": 12,
          "matchedRatio": 1,
          "confidence": 0.8969,
          "matchedWordIndexes": [
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28
          ],
          "matchedWords": [
            "他們",
            "的",
            "答",
            "案",
            "都",
            "從",
            "一",
            "束",
            "光",
            "開始。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.8969,
          "interpolatedWordUnits": true
        }
      ],
      "asrSpeechEnd": 6.22
    },
    {
      "id": "002",
      "scene": "context",
      "start": 668,
      "end": 979,
      "spoken": "以前，只看到一片脑区亮起，只能说明它和行为同时发生。要证明因果，得只按下一类细胞的开关，再看行为会不会跟着改变。",
      "subtitle": "以前，只看到一片脑区亮起，只能说明它和行为同时发生。要证明因果，得只按下一类细胞的开关，再看行为会不会跟着改变。",
      "subtitleParts": [
        {
          "text": "以前，只看到一片脑区亮起，",
          "start": 0.34,
          "end": 2.5,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 11,
          "expectedChars": 11,
          "matchedRatio": 1,
          "confidence": 0.902,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8
          ],
          "matchedWords": [
            "以前,",
            "只",
            "看到",
            "一",
            "片",
            "腦",
            "區",
            "亮",
            "起,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.902,
          "interpolatedWordUnits": true
        },
        {
          "text": "只能说明它和行为同时发生。",
          "start": 2.86,
          "end": 4.8,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 12,
          "expectedChars": 12,
          "matchedRatio": 1,
          "confidence": 0.9821,
          "matchedWordIndexes": [
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20
          ],
          "matchedWords": [
            "只",
            "能",
            "說",
            "明",
            "它",
            "和",
            "行",
            "為",
            "同",
            "時",
            "發",
            "生,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9821,
          "interpolatedWordUnits": false
        },
        {
          "text": "要证明因果，得只按下一类细胞的开关，",
          "start": 5.22,
          "end": 7.94,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 16,
          "expectedChars": 16,
          "matchedRatio": 1,
          "confidence": 0.9553,
          "matchedWordIndexes": [
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35
          ],
          "matchedWords": [
            "要",
            "證",
            "明",
            "因",
            "果,",
            "得",
            "只",
            "按",
            "下一",
            "類",
            "細",
            "胞",
            "的",
            "開",
            "關,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9553,
          "interpolatedWordUnits": true
        },
        {
          "text": "再看行为会不会跟着改变。",
          "start": 8.36,
          "end": 10,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 10,
          "expectedChars": 11,
          "matchedRatio": 0.9091,
          "confidence": 0.8988,
          "matchedWordIndexes": [
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            44,
            45
          ],
          "matchedWords": [
            "再",
            "看",
            "行",
            "為",
            "會",
            "不會",
            "跟",
            "改",
            "變。"
          ],
          "unmatchedText": "着",
          "extraRecognizedText": "著",
          "extraRecognizedChars": 1,
          "meanWordProbability": 0.9887,
          "interpolatedWordUnits": true,
          "reviewStatus": "homophonic-asr-reviewed"
        }
      ],
      "asrSpeechEnd": 10
    },
    {
      "id": "003",
      "scene": "algae",
      "start": 979,
      "end": 1168,
      "spoken": "这把开关没有先从人脑里找到。线索藏在一种会跟着光走的小绿藻身上。",
      "subtitle": "这把开关没有先从人脑里找到。线索藏在一种会跟着光走的小绿藻身上。",
      "subtitleParts": [
        {
          "text": "这把开关没有先从人脑里找到。",
          "start": 0,
          "end": 2.32,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 13,
          "expectedChars": 13,
          "matchedRatio": 1,
          "confidence": 0.9694,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11
          ],
          "matchedWords": [
            "这",
            "把",
            "开",
            "关",
            "没有",
            "先",
            "从",
            "人",
            "脑",
            "里",
            "找",
            "到"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9694,
          "interpolatedWordUnits": true
        },
        {
          "text": "线索藏在一种会跟着光走的小绿藻身上。",
          "start": 2.32,
          "end": 5.62,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 17,
          "expectedChars": 17,
          "matchedRatio": 1,
          "confidence": 0.9637,
          "matchedWordIndexes": [
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28
          ],
          "matchedWords": [
            "线",
            "索",
            "藏",
            "在",
            "一",
            "种",
            "会",
            "跟",
            "着",
            "光",
            "走",
            "的",
            "小",
            "绿",
            "藻",
            "身",
            "上"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9637,
          "interpolatedWordUnits": false
        }
      ],
      "asrSpeechEnd": 5.62
    },
    {
      "id": "004",
      "scene": "algae",
      "start": 1168,
      "end": 1513,
      "spoken": "把小绿藻放进透明容器，从左边照光，它就朝着光源游动。细胞上有一颗橙色感光点，收到光后，尾部两根细长鞭毛立刻改变节奏。",
      "subtitle": "把小绿藻放进透明容器，从左边照光，它就朝着光源游动。细胞上有一颗橙色感光点，收到光后，尾部两根细长鞭毛立刻改变节奏。",
      "subtitleParts": [
        {
          "text": "把小绿藻放进透明容器，从左边照光，",
          "start": 0,
          "end": 3.08,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 15,
          "expectedChars": 15,
          "matchedRatio": 1,
          "confidence": 0.9514,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14
          ],
          "matchedWords": [
            "把",
            "小",
            "绿",
            "藻",
            "放",
            "进",
            "透",
            "明",
            "容",
            "器,",
            "从",
            "左",
            "边",
            "照",
            "光,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9514,
          "interpolatedWordUnits": false
        },
        {
          "text": "它就朝着光源游动。",
          "start": 3.46,
          "end": 4.68,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 8,
          "expectedChars": 8,
          "matchedRatio": 1,
          "confidence": 0.9597,
          "matchedWordIndexes": [
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22
          ],
          "matchedWords": [
            "它",
            "就",
            "朝",
            "着",
            "光",
            "源",
            "游",
            "动,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9597,
          "interpolatedWordUnits": false
        },
        {
          "text": "细胞上有一颗橙色感光点，收到光后，",
          "start": 5.06,
          "end": 8.06,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 15,
          "expectedChars": 15,
          "matchedRatio": 1,
          "confidence": 0.9667,
          "matchedWordIndexes": [
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36
          ],
          "matchedWords": [
            "细",
            "胞",
            "上",
            "有一",
            "颗",
            "橙",
            "色",
            "感",
            "光",
            "点。",
            "收",
            "到",
            "光",
            "后,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9667,
          "interpolatedWordUnits": true
        },
        {
          "text": "尾部两根细长鞭毛立刻改变节奏。",
          "start": 8.42,
          "end": 11.2,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 13,
          "expectedChars": 14,
          "matchedRatio": 0.9286,
          "confidence": 0.8953,
          "matchedWordIndexes": [
            37,
            38,
            39,
            40,
            41,
            42,
            44,
            45,
            46,
            47,
            48,
            49,
            50
          ],
          "matchedWords": [
            "尾",
            "部",
            "两",
            "根",
            "细",
            "长",
            "毛",
            "立",
            "刻",
            "改",
            "变",
            "节",
            "奏。"
          ],
          "unmatchedText": "鞭",
          "extraRecognizedText": "边",
          "extraRecognizedChars": 1,
          "meanWordProbability": 0.9641,
          "interpolatedWordUnits": false,
          "reviewStatus": "homophonic-asr-reviewed"
        }
      ],
      "asrSpeechEnd": 11.2
    },
    {
      "id": "005",
      "scene": "algae",
      "start": 1513,
      "end": 1858,
      "spoken": "研究者用电极记录感光点附近的光电流。光到达后，大约半毫秒，电信号就出现了。人的眼睛走完类似过程，至少要十毫秒。为什么这种藻类这么快？",
      "subtitle": "研究者用电极记录感光点附近的光电流。光到达后，大约半毫秒，电信号就出现了。人的眼睛走完类似过程，至少要十毫秒。为什么这种藻类这么快？",
      "subtitleParts": [
        {
          "text": "研究者用电极记录感光点附近的光电流。",
          "start": 0,
          "end": 2.98,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 17,
          "expectedChars": 17,
          "matchedRatio": 1,
          "confidence": 0.9218,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16
          ],
          "matchedWords": [
            "研",
            "究",
            "者",
            "用",
            "电",
            "极",
            "记",
            "录",
            "感",
            "光",
            "点",
            "附",
            "近",
            "的",
            "光",
            "电",
            "流"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9218,
          "interpolatedWordUnits": false
        },
        {
          "text": "光到达后，大约半毫秒，电信号就出现了。",
          "start": 2.98,
          "end": 6.38,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 16,
          "expectedChars": 16,
          "matchedRatio": 1,
          "confidence": 0.9724,
          "matchedWordIndexes": [
            17,
            18,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32
          ],
          "matchedWords": [
            "光,",
            "到",
            "达",
            "后",
            "大",
            "约",
            "半",
            "毫",
            "秒,",
            "电",
            "信",
            "号",
            "就",
            "出",
            "现",
            "了。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9724,
          "interpolatedWordUnits": false
        },
        {
          "text": "人的眼睛走完类似过程，至少要十毫秒。",
          "start": 6.58,
          "end": 9.22,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 17,
          "expectedChars": 17,
          "matchedRatio": 1,
          "confidence": 0.9766,
          "matchedWordIndexes": [
            33,
            34,
            35,
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            43,
            44,
            45,
            46,
            47,
            48
          ],
          "matchedWords": [
            "人",
            "的",
            "眼",
            "睛",
            "走",
            "完",
            "类",
            "似",
            "过",
            "程,",
            "至",
            "少",
            "要",
            "10",
            "毫",
            "秒。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9766,
          "interpolatedWordUnits": true
        },
        {
          "text": "为什么这种藻类这么快？",
          "start": 9.56,
          "end": 10.96,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 8,
          "expectedChars": 10,
          "matchedRatio": 0.8,
          "confidence": 0.7788,
          "matchedWordIndexes": [
            49,
            50,
            51,
            54,
            55
          ],
          "matchedWords": [
            "为什么",
            "这",
            "种",
            "这么",
            "快?"
          ],
          "unmatchedText": "藻类",
          "extraRecognizedText": "早累",
          "extraRecognizedChars": 2,
          "meanWordProbability": 0.9735,
          "interpolatedWordUnits": true,
          "reviewStatus": "homophonic-asr-reviewed"
        }
      ],
      "asrSpeechEnd": 10.96
    },
    {
      "id": "006",
      "scene": "algae",
      "start": 1858,
      "end": 2193,
      "spoken": "他提出一个大胆猜想：会不会有一种蛋白，既能感受光线，又能直接充当离子通道？难处在于，这种蛋白离开原来的细胞后，很容易失去活性。",
      "subtitle": "他提出一个大胆猜想：会不会有一种蛋白，既能感受光线，又能直接充当离子通道？难处在于，这种蛋白离开原来的细胞后，很容易失去活性。",
      "subtitleParts": [
        {
          "text": "他提出一个大胆猜想：",
          "start": 0,
          "end": 1.52,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 9,
          "expectedChars": 9,
          "matchedRatio": 1,
          "confidence": 0.8565,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7
          ],
          "matchedWords": [
            "他",
            "提",
            "出",
            "一个",
            "大",
            "胆",
            "猜",
            "想,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.8565,
          "interpolatedWordUnits": true
        },
        {
          "text": "会不会有一种蛋白，既能感受光线，",
          "start": 1.84,
          "end": 4.32,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 14,
          "expectedChars": 14,
          "matchedRatio": 1,
          "confidence": 0.9762,
          "matchedWordIndexes": [
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19
          ],
          "matchedWords": [
            "会",
            "不会",
            "有一",
            "种",
            "蛋",
            "白,",
            "既",
            "能",
            "感",
            "受",
            "光",
            "线,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9762,
          "interpolatedWordUnits": true
        },
        {
          "text": "又能直接充当离子通道？",
          "start": 4.46,
          "end": 6.12,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 10,
          "expectedChars": 10,
          "matchedRatio": 1,
          "confidence": 0.9647,
          "matchedWordIndexes": [
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28
          ],
          "matchedWords": [
            "又",
            "能",
            "直接",
            "充",
            "当",
            "离",
            "子",
            "通",
            "道"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9647,
          "interpolatedWordUnits": true
        },
        {
          "text": "难处在于，这种蛋白离开原来的细胞后，",
          "start": 6.12,
          "end": 9.28,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 16,
          "expectedChars": 16,
          "matchedRatio": 1,
          "confidence": 0.9347,
          "matchedWordIndexes": [
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            43,
            44
          ],
          "matchedWords": [
            "难",
            "处",
            "在",
            "于,",
            "这",
            "种",
            "蛋",
            "白",
            "离",
            "开",
            "原",
            "来",
            "的",
            "细",
            "胞",
            "后,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9347,
          "interpolatedWordUnits": false
        },
        {
          "text": "很容易失去活性。",
          "start": 9.44,
          "end": 10.52,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 6,
          "expectedChars": 7,
          "matchedRatio": 0.8571,
          "confidence": 0.8353,
          "matchedWordIndexes": [
            45,
            46,
            47,
            48,
            50
          ],
          "matchedWords": [
            "很",
            "容易",
            "失",
            "去",
            "性"
          ],
          "unmatchedText": "活",
          "extraRecognizedText": "火",
          "extraRecognizedChars": 1,
          "meanWordProbability": 0.9745,
          "interpolatedWordUnits": true,
          "reviewStatus": "homophonic-asr-reviewed"
        }
      ],
      "asrSpeechEnd": 10.52
    },
    {
      "id": "007",
      "scene": "channel",
      "start": 2193,
      "end": 2418,
      "spoken": "转机来自基因测序。找到的基因被分别送进蛙卵，让蛙卵在细胞膜上做出这种蛋白。",
      "subtitle": "转机来自基因测序。找到的基因被分别送进蛙卵，让蛙卵在细胞膜上做出这种蛋白。",
      "subtitleParts": [
        {
          "text": "转机来自基因测序。",
          "start": 0,
          "end": 1.72,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 8,
          "expectedChars": 8,
          "matchedRatio": 1,
          "confidence": 0.9043,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7
          ],
          "matchedWords": [
            "轉",
            "機",
            "來",
            "自",
            "基",
            "因",
            "測",
            "序,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9043,
          "interpolatedWordUnits": false
        },
        {
          "text": "找到的基因被分别送进蛙卵，",
          "start": 2.06,
          "end": 4.26,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 11,
          "expectedChars": 12,
          "matchedRatio": 0.9167,
          "confidence": 0.8725,
          "matchedWordIndexes": [
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            19
          ],
          "matchedWords": [
            "找",
            "到",
            "的",
            "基",
            "因",
            "被",
            "分",
            "別",
            "送",
            "進",
            "卵,"
          ],
          "unmatchedText": "蛙",
          "extraRecognizedText": "瓦",
          "extraRecognizedChars": 1,
          "meanWordProbability": 0.9519,
          "interpolatedWordUnits": false,
          "reviewStatus": "homophonic-asr-reviewed"
        },
        {
          "text": "让蛙卵在细胞膜上做出这种蛋白。",
          "start": 4.66,
          "end": 7.14,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 13,
          "expectedChars": 14,
          "matchedRatio": 0.9286,
          "confidence": 0.8785,
          "matchedWordIndexes": [
            20,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32
          ],
          "matchedWords": [
            "讓",
            "卵",
            "在",
            "細",
            "胞",
            "膜",
            "上",
            "做",
            "出",
            "這種",
            "蛋",
            "白。"
          ],
          "unmatchedText": "蛙",
          "extraRecognizedText": "瓦",
          "extraRecognizedChars": 1,
          "meanWordProbability": 0.9461,
          "interpolatedWordUnits": true,
          "reviewStatus": "homophonic-asr-reviewed"
        }
      ],
      "asrSpeechEnd": 7.14
    },
    {
      "id": "008",
      "scene": "channel",
      "start": 2418,
      "end": 2710,
      "spoken": "蓝光一照，通道不到一毫秒就打开。带电粒子穿过细胞膜，细胞电压立刻变化。二零零三年，他们公布了这个结果。",
      "subtitle": "蓝光一照，通道不到一毫秒就打开。带电粒子穿过细胞膜，细胞电压立刻变化。二零零三年，他们公布了这个结果。",
      "subtitleParts": [
        {
          "text": "蓝光一照，通道不到一毫秒就打开。",
          "start": 0,
          "end": 2.82,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 14,
          "expectedChars": 14,
          "matchedRatio": 1,
          "confidence": 0.8625,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12
          ],
          "matchedWords": [
            "藍",
            "光",
            "一",
            "照,",
            "通",
            "道",
            "不到",
            "1",
            "毫",
            "秒",
            "就",
            "打",
            "开。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.8625,
          "interpolatedWordUnits": true
        },
        {
          "text": "带电粒子穿过细胞膜，细胞电压立刻变化。",
          "start": 3.5,
          "end": 6.64,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 16,
          "expectedChars": 17,
          "matchedRatio": 0.9412,
          "confidence": 0.902,
          "matchedWordIndexes": [
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29
          ],
          "matchedWords": [
            "电",
            "粒",
            "子",
            "穿",
            "过",
            "细",
            "胞",
            "膜,",
            "细",
            "胞",
            "电",
            "压",
            "立",
            "刻",
            "变",
            "化。"
          ],
          "unmatchedText": "带",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9583,
          "interpolatedWordUnits": false,
          "reviewStatus": "homophonic-asr-reviewed"
        },
        {
          "text": "二零零三年，他们公布了这个结果。",
          "start": 7.08,
          "end": 9.5,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 14,
          "expectedChars": 14,
          "matchedRatio": 1,
          "confidence": 0.9163,
          "matchedWordIndexes": [
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39
          ],
          "matchedWords": [
            "200",
            "3",
            "年,",
            "他们",
            "公",
            "布",
            "了",
            "这个",
            "结",
            "果。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9163,
          "interpolatedWordUnits": true
        }
      ],
      "asrSpeechEnd": 9.5
    },
    {
      "id": "009",
      "scene": "channel",
      "start": 2710,
      "end": 2966,
      "spoken": "他们还把这段基因放进两种培养细胞。原本不响应光的细胞，装上通道后，蓝光就能让它们发出电信号。",
      "subtitle": "他们还把这段基因放进两种培养细胞。原本不响应光的细胞，装上通道后，蓝光就能让它们发出电信号。",
      "subtitleParts": [
        {
          "text": "他们还把这段基因放进两种培养细胞。",
          "start": 0.3,
          "end": 2.68,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 15,
          "expectedChars": 16,
          "matchedRatio": 0.9375,
          "confidence": 0.8707,
          "matchedWordIndexes": [
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15
          ],
          "matchedWords": [
            "们",
            "还",
            "把",
            "这",
            "段",
            "基",
            "因",
            "放",
            "进",
            "两",
            "种",
            "培",
            "养",
            "细",
            "胞"
          ],
          "unmatchedText": "他",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9288,
          "interpolatedWordUnits": false,
          "reviewStatus": "homophonic-asr-reviewed"
        },
        {
          "text": "原本不响应光的细胞，装上通道后，",
          "start": 2.68,
          "end": 5.78,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 13,
          "expectedChars": 14,
          "matchedRatio": 0.9286,
          "confidence": 0.8412,
          "matchedWordIndexes": [
            16,
            17,
            18,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29
          ],
          "matchedWords": [
            "原",
            "本",
            "不",
            "应",
            "光",
            "的",
            "细",
            "胞",
            " 装",
            "上",
            "通",
            "道",
            "后"
          ],
          "unmatchedText": "响",
          "extraRecognizedText": "想",
          "extraRecognizedChars": 1,
          "meanWordProbability": 0.9059,
          "interpolatedWordUnits": false,
          "reviewStatus": "homophonic-asr-reviewed"
        },
        {
          "text": "蓝光就能让它们发出电信号。",
          "start": 5.78,
          "end": 8.2,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 12,
          "expectedChars": 12,
          "matchedRatio": 1,
          "confidence": 0.9573,
          "matchedWordIndexes": [
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39,
            40,
            41
          ],
          "matchedWords": [
            "蓝",
            "光",
            "就",
            "能",
            "让",
            "它",
            "们",
            "发",
            "出",
            "电",
            "信",
            "号"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9573,
          "interpolatedWordUnits": false
        }
      ],
      "asrSpeechEnd": 8.2
    },
    {
      "id": "010",
      "scene": "channel",
      "start": 2966,
      "end": 3289,
      "spoken": "到这里，链条接上了：光照到蛋白，蛋白打开通道，离子流过，细胞发出电信号。下一个问题是，神经元能不能也这样控制？",
      "subtitle": "到这里，链条接上了：光照到蛋白，蛋白打开通道，离子流过，细胞发出电信号。下一个问题是，神经元能不能也这样控制？",
      "subtitleParts": [
        {
          "text": "到这里，链条接上了：",
          "start": 0,
          "end": 1.92,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 8,
          "expectedChars": 8,
          "matchedRatio": 1,
          "confidence": 0.8805,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6
          ],
          "matchedWords": [
            "到",
            "这里,",
            "链",
            "条",
            "接",
            "上",
            "了,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.8805,
          "interpolatedWordUnits": true
        },
        {
          "text": "光照到蛋白，蛋白打开通道，离子流过，",
          "start": 2.18,
          "end": 5.38,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 15,
          "expectedChars": 15,
          "matchedRatio": 1,
          "confidence": 0.9109,
          "matchedWordIndexes": [
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21
          ],
          "matchedWords": [
            "光",
            "照",
            "到",
            "蛋",
            "白,",
            "蛋",
            "白",
            "打",
            "开",
            "通",
            "道,",
            " 离",
            "子",
            "流",
            "过,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9109,
          "interpolatedWordUnits": false
        },
        {
          "text": "细胞发出电信号。",
          "start": 5.72,
          "end": 6.96,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 7,
          "expectedChars": 7,
          "matchedRatio": 1,
          "confidence": 0.9922,
          "matchedWordIndexes": [
            22,
            23,
            24,
            25,
            26,
            27,
            28
          ],
          "matchedWords": [
            "细",
            "胞",
            "发",
            "出",
            "电",
            "信",
            "号。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9922,
          "interpolatedWordUnits": false
        },
        {
          "text": "下一个问题是，神经元能不能也这样控制？",
          "start": 7.3,
          "end": 10.12,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 17,
          "expectedChars": 17,
          "matchedRatio": 1,
          "confidence": 0.9462,
          "matchedWordIndexes": [
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39,
            40,
            41
          ],
          "matchedWords": [
            "下",
            "一个",
            "问题",
            "是,",
            "神",
            "经",
            "元",
            "能",
            "不能",
            "也",
            "这样",
            "控",
            "制?"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9462,
          "interpolatedWordUnits": true
        }
      ],
      "asrSpeechEnd": 10.12
    },
    {
      "id": "011",
      "scene": "neuron",
      "start": 3289,
      "end": 3504,
      "spoken": "一个研究团队一直在找这把开关。他们把感光基因送进透明培养容器里的鼠类神经细胞。",
      "subtitle": "一个研究团队一直在找这把开关。他们把感光基因送进透明培养容器里的鼠类神经细胞。",
      "subtitleParts": [
        {
          "text": "一个研究团队一直在找这把开关。",
          "start": 0,
          "end": 2.2,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 14,
          "expectedChars": 14,
          "matchedRatio": 1,
          "confidence": 0.9505,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11
          ],
          "matchedWords": [
            "一个",
            "研",
            "究",
            "团",
            "队",
            "一直",
            "在",
            "找",
            "这",
            "把",
            "开",
            "关"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9505,
          "interpolatedWordUnits": true
        },
        {
          "text": "他们把感光基因送进透明培养容器里的鼠类神经细胞。",
          "start": 2.2,
          "end": 6.4,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 23,
          "expectedChars": 23,
          "matchedRatio": 1,
          "confidence": 0.9544,
          "matchedWordIndexes": [
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33
          ],
          "matchedWords": [
            "他们",
            "把",
            "感",
            "光",
            "基",
            "因",
            "送",
            "进",
            "透",
            "明",
            "培",
            "养",
            "容",
            "器",
            "里",
            "的",
            "鼠",
            "类",
            "神",
            "经",
            "细",
            "胞"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9544,
          "interpolatedWordUnits": true
        }
      ],
      "asrSpeechEnd": 6.4
    },
    {
      "id": "012",
      "scene": "neuron",
      "start": 3504,
      "end": 3796,
      "spoken": "神经细胞一开始很安静。蓝光一闪，电信号就沿着神经往前走。光脉冲和电信号几乎同时出现。二零零五年，结果发表。",
      "subtitle": "神经细胞一开始很安静。蓝光一闪，电信号就沿着神经往前走。光脉冲和电信号几乎同时出现。二零零五年，结果发表。",
      "subtitleParts": [
        {
          "text": "神经细胞一开始很安静。",
          "start": 0,
          "end": 1.94,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 10,
          "expectedChars": 10,
          "matchedRatio": 1,
          "confidence": 0.9502,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8
          ],
          "matchedWords": [
            "神",
            "经",
            "细",
            "胞",
            "一",
            "开始",
            "很",
            "安",
            "静"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9502,
          "interpolatedWordUnits": true
        },
        {
          "text": "蓝光一闪，电信号就沿着神经往前走。",
          "start": 2.26,
          "end": 4.94,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 15,
          "expectedChars": 15,
          "matchedRatio": 1,
          "confidence": 0.9883,
          "matchedWordIndexes": [
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22,
            23
          ],
          "matchedWords": [
            " 蓝",
            "光",
            "一",
            "闪",
            " 电",
            "信",
            "号",
            "就",
            "沿",
            "着",
            "神",
            "经",
            "往",
            "前",
            "走"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9883,
          "interpolatedWordUnits": false
        },
        {
          "text": "光脉冲和电信号几乎同时出现。",
          "start": 4.94,
          "end": 7.58,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 12,
          "expectedChars": 13,
          "matchedRatio": 0.9231,
          "confidence": 0.843,
          "matchedWordIndexes": [
            24,
            25,
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36
          ],
          "matchedWords": [
            "光",
            "脉",
            "和",
            "电",
            "信",
            "号",
            "几",
            "乎",
            "同",
            "时",
            "出",
            "现"
          ],
          "unmatchedText": "冲",
          "extraRecognizedText": "充",
          "extraRecognizedChars": 1,
          "meanWordProbability": 0.9133,
          "interpolatedWordUnits": false,
          "reviewStatus": "homophonic-asr-reviewed"
        },
        {
          "text": "二零零五年，结果发表。",
          "start": 7.92,
          "end": 9.5,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 9,
          "expectedChars": 9,
          "matchedRatio": 1,
          "confidence": 0.942,
          "matchedWordIndexes": [
            37,
            38,
            39,
            40,
            41,
            42,
            43
          ],
          "matchedWords": [
            " 200",
            "5",
            "年",
            " 结",
            "果",
            "发",
            "表"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.942,
          "interpolatedWordUnits": true
        }
      ],
      "asrSpeechEnd": 9.5
    },
    {
      "id": "013",
      "scene": "neuron",
      "start": 3796,
      "end": 4141,
      "spoken": "关键不只是让细胞亮起来，而是能按时间控制。光脉冲在千分之一秒内出现，电信号也几乎同时响应。研究者终于有了可重复、可定位的控制。",
      "subtitle": "关键不只是让细胞亮起来，而是能按时间控制。光脉冲在千分之一秒内出现，电信号也几乎同时响应。研究者终于有了可重复、可定位的控制。",
      "subtitleParts": [
        {
          "text": "关键不只是让细胞亮起来，而是能按时间控制。",
          "start": 0,
          "end": 3.5,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 19,
          "expectedChars": 19,
          "matchedRatio": 1,
          "confidence": 0.954,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15
          ],
          "matchedWords": [
            "關",
            "鍵",
            "不",
            "只是",
            "讓",
            "細",
            "胞",
            "亮",
            "起來,",
            "而",
            "是",
            "能",
            "按",
            "時間",
            "控",
            "制"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.954,
          "interpolatedWordUnits": true
        },
        {
          "text": "光脉冲在千分之一秒内出现，电信号也几乎同时响应。",
          "start": 3.5,
          "end": 8.04,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 21,
          "expectedChars": 22,
          "matchedRatio": 0.9545,
          "confidence": 0.8997,
          "matchedWordIndexes": [
            16,
            17,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37
          ],
          "matchedWords": [
            "光",
            "脈",
            "在",
            "千",
            "分",
            "之",
            "一",
            "秒",
            "內",
            "出",
            "現,",
            "電",
            "信",
            "號",
            "也",
            "幾",
            "乎",
            "同",
            "時",
            "響",
            "應"
          ],
          "unmatchedText": "冲",
          "extraRecognizedText": "充",
          "extraRecognizedChars": 1,
          "meanWordProbability": 0.9426,
          "interpolatedWordUnits": false,
          "reviewStatus": "homophonic-asr-reviewed"
        },
        {
          "text": "研究者终于有了可重复、可定位的控制。",
          "start": 8.04,
          "end": 11.02,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 16,
          "expectedChars": 16,
          "matchedRatio": 1,
          "confidence": 0.9468,
          "matchedWordIndexes": [
            38,
            39,
            40,
            41,
            42,
            43,
            44,
            45,
            46,
            47,
            48,
            49,
            50,
            51,
            52,
            53
          ],
          "matchedWords": [
            "研",
            "究",
            "者",
            "終",
            "於",
            "有",
            "了",
            "可",
            "重",
            "複",
            "可",
            "定",
            "位",
            "的",
            "控",
            "制"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9468,
          "interpolatedWordUnits": false
        }
      ],
      "asrSpeechEnd": 11.02
    },
    {
      "id": "014",
      "scene": "neuron",
      "start": 4141,
      "end": 4431,
      "spoken": "遗传学负责挑出哪一类细胞，光负责决定什么时候按下开关。二零零六年，这套方法有了名字：光遗传学。",
      "subtitle": "遗传学负责挑出哪一类细胞，光负责决定什么时候按下开关。二零零六年，这套方法有了名字：光遗传学。",
      "subtitleParts": [
        {
          "text": "遗传学负责挑出哪一类细胞，",
          "start": 0,
          "end": 2.38,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 12,
          "expectedChars": 12,
          "matchedRatio": 1,
          "confidence": 0.9648,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11
          ],
          "matchedWords": [
            "遗",
            "传",
            "学",
            "负",
            "责",
            "挑",
            "出",
            "哪",
            "一",
            "类",
            "细",
            "胞,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9648,
          "interpolatedWordUnits": false
        },
        {
          "text": "光负责决定什么时候按下开关。",
          "start": 2.66,
          "end": 4.66,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 13,
          "expectedChars": 13,
          "matchedRatio": 1,
          "confidence": 0.9857,
          "matchedWordIndexes": [
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22
          ],
          "matchedWords": [
            "光",
            "负",
            "责",
            "决",
            "定",
            "什么",
            "时候",
            "按",
            "下",
            "开",
            "关。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9857,
          "interpolatedWordUnits": true
        },
        {
          "text": "二零零六年，这套方法有了名字：",
          "start": 5.04,
          "end": 7.68,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 13,
          "expectedChars": 13,
          "matchedRatio": 1,
          "confidence": 0.9772,
          "matchedWordIndexes": [
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33
          ],
          "matchedWords": [
            "200",
            "6",
            "年,",
            "这",
            "套",
            "方",
            "法",
            "有",
            "了",
            "名",
            "字。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9772,
          "interpolatedWordUnits": true
        },
        {
          "text": "光遗传学。",
          "start": 8.16,
          "end": 8.98,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 4,
          "expectedChars": 4,
          "matchedRatio": 1,
          "confidence": 0.9935,
          "matchedWordIndexes": [
            34,
            35,
            36,
            37
          ],
          "matchedWords": [
            "光",
            "遗",
            "传",
            "学,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9935,
          "interpolatedWordUnits": false
        }
      ],
      "asrSpeechEnd": 8.98
    },
    {
      "id": "015",
      "scene": "brain",
      "start": 4431,
      "end": 4776,
      "spoken": "一年后，一根细光纤穿过小鼠头骨，伸进运动皮层。研究者只给一类神经细胞装上通道，再用蓝光刺激它们，小鼠的胡须随之动起来。",
      "subtitle": "一年后，一根细光纤穿过小鼠头骨，伸进运动皮层。研究者只给一类神经细胞装上通道，再用蓝光刺激它们，小鼠的胡须随之动起来。",
      "subtitleParts": [
        {
          "text": "一年后，一根细光纤穿过小鼠头骨，伸进运动皮层。",
          "start": 0,
          "end": 4.22,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 20,
          "expectedChars": 20,
          "matchedRatio": 1,
          "confidence": 0.9187,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19
          ],
          "matchedWords": [
            "一",
            "年",
            "后,",
            "一",
            "根",
            "细",
            "光",
            "纤",
            "穿",
            "过",
            "小",
            "鼠",
            "头",
            "骨,",
            "伸",
            "进",
            "运",
            "动",
            "皮",
            "层。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9187,
          "interpolatedWordUnits": false
        },
        {
          "text": "研究者只给一类神经细胞装上通道，",
          "start": 4.76,
          "end": 7.4,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 15,
          "expectedChars": 15,
          "matchedRatio": 1,
          "confidence": 0.9883,
          "matchedWordIndexes": [
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34
          ],
          "matchedWords": [
            "研",
            "究",
            "者",
            "只",
            "给",
            "一",
            "类",
            "神",
            "经",
            "细",
            "胞",
            "装",
            "上",
            "通",
            "道,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9883,
          "interpolatedWordUnits": false
        },
        {
          "text": "再用蓝光刺激它们，小鼠的胡须随之动起来。",
          "start": 7.9,
          "end": 11.2,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 18,
          "expectedChars": 18,
          "matchedRatio": 1,
          "confidence": 0.9001,
          "matchedWordIndexes": [
            35,
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            43,
            44,
            45,
            46,
            47,
            48,
            49,
            50,
            51,
            52
          ],
          "matchedWords": [
            "再",
            "用",
            "蓝",
            "光",
            "刺",
            "激",
            "它",
            "们,",
            "小",
            "鼠",
            "的",
            "胡",
            "须",
            "随",
            "之",
            "动",
            "起",
            "来。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9001,
          "interpolatedWordUnits": false
        }
      ],
      "asrSpeechEnd": 11.2
    },
    {
      "id": "016",
      "scene": "brain",
      "start": 4776,
      "end": 5063,
      "spoken": "同一年，研究者还把一类和清醒有关的细胞点亮，睡着的小鼠醒了过来。重点在于，光只碰到被标记的那一群细胞。",
      "subtitle": "同一年，研究者还把一类和清醒有关的细胞点亮，睡着的小鼠醒了过来。重点在于，光只碰到被标记的那一群细胞。",
      "subtitleParts": [
        {
          "text": "同一年，研究者还把一类和清醒有关的细胞点亮，",
          "start": 0,
          "end": 3.88,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 20,
          "expectedChars": 20,
          "matchedRatio": 1,
          "confidence": 0.9335,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19
          ],
          "matchedWords": [
            "同",
            "一",
            "年,",
            "研",
            "究",
            "者",
            "还",
            "把",
            "一",
            "类",
            "和",
            "清",
            "醒",
            "有",
            "关",
            "的",
            "细",
            "胞",
            "点",
            "亮,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9335,
          "interpolatedWordUnits": false
        },
        {
          "text": "睡着的小鼠醒了过来。",
          "start": 4.26,
          "end": 5.86,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 9,
          "expectedChars": 9,
          "matchedRatio": 1,
          "confidence": 0.9547,
          "matchedWordIndexes": [
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28
          ],
          "matchedWords": [
            "睡",
            "着",
            "的",
            "小",
            "鼠",
            "醒",
            "了",
            "过",
            "来,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9547,
          "interpolatedWordUnits": false
        },
        {
          "text": "重点在于，光只碰到被标记的那一群细胞。",
          "start": 6.14,
          "end": 9.26,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 17,
          "expectedChars": 17,
          "matchedRatio": 1,
          "confidence": 0.9662,
          "matchedWordIndexes": [
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            43,
            44,
            45
          ],
          "matchedWords": [
            "重",
            "点",
            "在",
            "于",
            "光",
            "只",
            "碰",
            "到",
            "被",
            "标",
            "记",
            "的",
            "那",
            "一",
            "群",
            "细",
            "胞。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9662,
          "interpolatedWordUnits": false
        }
      ],
      "asrSpeechEnd": 9.26
    },
    {
      "id": "017",
      "scene": "brain",
      "start": 5063,
      "end": 5425,
      "spoken": "二零一二年，研究者先标记恐惧训练时活跃的细胞。几天后，只打开蓝光，小鼠就再次停住不动。这说明，这群细胞足以让那段记忆重新出现。",
      "subtitle": "二零一二年，研究者先标记恐惧训练时活跃的细胞。几天后，只打开蓝光，小鼠就再次停住不动。这说明，这群细胞足以让那段记忆重新出现。",
      "subtitleParts": [
        {
          "text": "二零一二年，研究者先标记恐惧训练时活跃的细胞。",
          "start": 0,
          "end": 4.14,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 21,
          "expectedChars": 21,
          "matchedRatio": 1,
          "confidence": 0.9294,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18
          ],
          "matchedWords": [
            "20",
            "12",
            "年,",
            "研",
            "究",
            "者",
            "先",
            "标",
            "记",
            "恐",
            "惧",
            "训",
            "练",
            "时",
            "活",
            "跃",
            "的",
            "细",
            "胞,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9294,
          "interpolatedWordUnits": true
        },
        {
          "text": "几天后，只打开蓝光，小鼠就再次停住不动。",
          "start": 4.54,
          "end": 7.82,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 17,
          "expectedChars": 17,
          "matchedRatio": 1,
          "confidence": 0.9722,
          "matchedWordIndexes": [
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35
          ],
          "matchedWords": [
            "几",
            "天",
            "后",
            "只",
            "打",
            "开",
            "蓝",
            "光,",
            "小",
            "鼠",
            "就",
            "再",
            "次",
            "停",
            "住",
            "不",
            "动。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9722,
          "interpolatedWordUnits": false
        },
        {
          "text": "这说明，这群细胞足以让那段记忆重新出现。",
          "start": 8.18,
          "end": 11.44,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 18,
          "expectedChars": 18,
          "matchedRatio": 1,
          "confidence": 0.9905,
          "matchedWordIndexes": [
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            43,
            44,
            45,
            46,
            47,
            48,
            49,
            50,
            51,
            52,
            53
          ],
          "matchedWords": [
            "这",
            "说",
            "明,",
            "这",
            "群",
            "细",
            "胞",
            "足",
            "以",
            "让",
            "那",
            "段",
            "记",
            "忆",
            "重",
            "新",
            "出",
            "现。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9905,
          "interpolatedWordUnits": false
        }
      ],
      "asrSpeechEnd": 11.44
    },
    {
      "id": "018",
      "scene": "impact",
      "start": 5425,
      "end": 5739,
      "spoken": "今天，这种方法已经被用来拆分疼痛、饥饿、奖赏、社交和注意力。混在一起的细胞，终于可以沿着一条条神经线路分开观察。",
      "subtitle": "今天，这种方法已经被用来拆分疼痛、饥饿、奖赏、社交和注意力。混在一起的细胞，终于可以沿着一条条神经线路分开观察。",
      "subtitleParts": [
        {
          "text": "今天，这种方法已经被用来拆分疼痛、饥饿、奖赏、",
          "start": 0,
          "end": 4.26,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 19,
          "expectedChars": 19,
          "matchedRatio": 1,
          "confidence": 0.9116,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16
          ],
          "matchedWords": [
            "今天,",
            "这",
            "种",
            "方",
            "法",
            "已经",
            "被",
            "用",
            "来",
            "拆",
            "分",
            "疼",
            "痛、",
            "饥",
            "饿、",
            "奖",
            "赏、"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9116,
          "interpolatedWordUnits": true
        },
        {
          "text": "社交和注意力。",
          "start": 4.54,
          "end": 5.62,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 6,
          "expectedChars": 6,
          "matchedRatio": 1,
          "confidence": 0.9698,
          "matchedWordIndexes": [
            17,
            18,
            19,
            20,
            21
          ],
          "matchedWords": [
            "社",
            "交",
            "和",
            "注意",
            "力"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9698,
          "interpolatedWordUnits": true
        },
        {
          "text": "混在一起的细胞，终于可以沿着一条条神经线路分开",
          "start": 5.62,
          "end": 9.58,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 22,
          "expectedChars": 22,
          "matchedRatio": 1,
          "confidence": 0.9745,
          "matchedWordIndexes": [
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39,
            40,
            41
          ],
          "matchedWords": [
            "混",
            "在",
            "一起",
            "的",
            "细",
            "胞,",
            "终",
            "于",
            "可以",
            "沿",
            "着",
            "一",
            "条",
            "条",
            "神",
            "经",
            "线",
            "路",
            "分",
            "开"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9745,
          "interpolatedWordUnits": true
        },
        {
          "text": "观察。",
          "start": 9.58,
          "end": 9.96,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 2,
          "expectedChars": 2,
          "matchedRatio": 1,
          "confidence": 0.9924,
          "matchedWordIndexes": [
            42,
            43
          ],
          "matchedWords": [
            "观",
            "察。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9924,
          "interpolatedWordUnits": false
        }
      ],
      "asrSpeechEnd": 9.96
    },
    {
      "id": "019",
      "scene": "impact",
      "start": 5739,
      "end": 6216,
      "spoken": "这项技术也在走向临床。失去感光细胞的患者，正在接受早期试验。研究者把光控通道送进视网膜，再用发光眼镜帮助辨认物体。目前仍然是探索中的治疗，需要基因递送和专用光源。",
      "subtitle": "这项技术也在走向临床。失去感光细胞的患者，正在接受早期试验。研究者把光控通道送进视网膜，再用发光眼镜帮助辨认物体。目前仍然是探索中的治疗，需要基因递送和专用光源。",
      "subtitleParts": [
        {
          "text": "这项技术也在走向临床。",
          "start": 0,
          "end": 1.84,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 10,
          "expectedChars": 10,
          "matchedRatio": 1,
          "confidence": 0.9294,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9
          ],
          "matchedWords": [
            "这",
            "项",
            "技",
            "术",
            "也",
            "在",
            "走",
            "向",
            "临",
            "床,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9294,
          "interpolatedWordUnits": false
        },
        {
          "text": "失去感光细胞的患者，正在接受早期试验。",
          "start": 2.38,
          "end": 5.48,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 17,
          "expectedChars": 17,
          "matchedRatio": 1,
          "confidence": 0.9766,
          "matchedWordIndexes": [
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26
          ],
          "matchedWords": [
            " 失",
            "去",
            "感",
            "光",
            "细",
            "胞",
            "的",
            "患",
            "者",
            "正",
            "在",
            "接",
            "受",
            "早",
            "期",
            "试",
            "验,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9766,
          "interpolatedWordUnits": false
        },
        {
          "text": "研究者把光控通道送进视网膜，",
          "start": 5.74,
          "end": 8.3,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 13,
          "expectedChars": 13,
          "matchedRatio": 1,
          "confidence": 0.9406,
          "matchedWordIndexes": [
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39
          ],
          "matchedWords": [
            "研",
            "究",
            "者",
            "把",
            "光",
            "控",
            "通",
            "道",
            "送",
            "进",
            "视",
            "网",
            "膜,"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9406,
          "interpolatedWordUnits": false
        },
        {
          "text": "再用发光眼镜帮助辨认物体。",
          "start": 8.8,
          "end": 10.78,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 10,
          "expectedChars": 12,
          "matchedRatio": 0.8333,
          "confidence": 0.8243,
          "matchedWordIndexes": [
            40,
            41,
            42,
            43,
            44,
            45,
            46,
            47,
            50,
            51
          ],
          "matchedWords": [
            " 再",
            "用",
            "发",
            "光",
            "眼",
            "镜",
            "帮",
            "助",
            "物",
            "体。"
          ],
          "unmatchedText": "辨认",
          "extraRecognizedText": "变人",
          "extraRecognizedChars": 2,
          "meanWordProbability": 0.9892,
          "interpolatedWordUnits": false,
          "reviewStatus": "homophonic-asr-reviewed"
        },
        {
          "text": "目前仍然是探索中的治疗，需要基因递送和专用光源。",
          "start": 11.16,
          "end": 15.4,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 22,
          "expectedChars": 22,
          "matchedRatio": 1,
          "confidence": 0.9751,
          "matchedWordIndexes": [
            52,
            53,
            54,
            55,
            56,
            57,
            58,
            59,
            60,
            61,
            62,
            63,
            64,
            65,
            66,
            67,
            68,
            69,
            70,
            71
          ],
          "matchedWords": [
            "目前",
            "仍",
            "然",
            "是",
            "探",
            "索",
            "中",
            "的",
            "治",
            "疗,",
            " 需要",
            "基",
            "因",
            "递",
            "送",
            "和",
            "专",
            "用",
            "光",
            "源。"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9751,
          "interpolatedWordUnits": true
        }
      ],
      "asrSpeechEnd": 15.4
    },
    {
      "id": "020",
      "scene": "impact",
      "start": 6216,
      "end": 6525,
      "spoken": "这一项诺贝尔奖打动人的地方，是把一个大问题拆成四个能验证的小问题：哪种细胞，哪种蛋白，哪一束光，产生了哪一个信号。",
      "subtitle": "这一项诺贝尔奖打动人的地方，是把一个大问题拆成四个能验证的小问题：哪种细胞，哪种蛋白，哪一束光，产生了哪一个信号。",
      "subtitleParts": [
        {
          "text": "这一项诺贝尔奖打动人的地方，",
          "start": 0,
          "end": 2.18,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 13,
          "expectedChars": 13,
          "matchedRatio": 1,
          "confidence": 0.9116,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11
          ],
          "matchedWords": [
            "这",
            "一",
            "项",
            "诺",
            "贝",
            "尔",
            "奖",
            "打",
            "动",
            "人",
            "的",
            "地方"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9116,
          "interpolatedWordUnits": true
        },
        {
          "text": "是把一个大问题拆成四个能验证的小问题：",
          "start": 2.18,
          "end": 5.36,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 18,
          "expectedChars": 18,
          "matchedRatio": 1,
          "confidence": 0.9624,
          "matchedWordIndexes": [
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26
          ],
          "matchedWords": [
            "是",
            "把",
            "一个",
            "大",
            "问题",
            "拆",
            "成",
            "四",
            "个",
            "能",
            "验",
            "证",
            "的",
            "小",
            "问题"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9624,
          "interpolatedWordUnits": true
        },
        {
          "text": "哪种细胞，哪种蛋白，哪一束光，产生了哪一个信号。",
          "start": 5.36,
          "end": 9.94,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 20,
          "expectedChars": 20,
          "matchedRatio": 1,
          "confidence": 0.9178,
          "matchedWordIndexes": [
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            43,
            44,
            45
          ],
          "matchedWords": [
            "哪",
            "种",
            "细",
            "胞,",
            "哪",
            "种",
            "蛋",
            "白,",
            "哪",
            "一",
            "束",
            "光,",
            "产",
            "生",
            "了",
            "哪",
            "一个",
            "信",
            "号"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9178,
          "interpolatedWordUnits": true
        }
      ],
      "asrSpeechEnd": 9.94
    },
    {
      "id": "021",
      "scene": "impact",
      "start": 6525,
      "end": 6853,
      "spoken": "故事从这种藻类的感光点开始，经过一根光纤，最后让小鼠的胡须动了一下。这个故事，就是今年诺贝尔生理学或医学奖的核心。",
      "subtitle": "故事从这种藻类的感光点开始，经过一根光纤，最后让小鼠的胡须动了一下。这个故事，就是今年诺贝尔生理学或医学奖的核心。",
      "subtitleParts": [
        {
          "text": "故事从这种藻类的感光点开始，经过一根光纤，",
          "start": 0,
          "end": 4.04,
          "status": "partial",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 18,
          "expectedChars": 19,
          "matchedRatio": 0.9474,
          "confidence": 0.8436,
          "matchedWordIndexes": [
            0,
            1,
            2,
            3,
            4,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17
          ],
          "matchedWords": [
            "故",
            "事",
            "从",
            "这",
            "种",
            "类",
            "的",
            "感",
            "光",
            "点",
            "开始",
            "经",
            "过",
            "一",
            "根",
            "光",
            "纤"
          ],
          "unmatchedText": "藻",
          "extraRecognizedText": "早",
          "extraRecognizedChars": 1,
          "meanWordProbability": 0.8905,
          "interpolatedWordUnits": true,
          "reviewStatus": "homophonic-asr-reviewed"
        },
        {
          "text": "最后让小鼠的胡须动了一下。",
          "start": 4.04,
          "end": 6.14,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 12,
          "expectedChars": 12,
          "matchedRatio": 1,
          "confidence": 0.8558,
          "matchedWordIndexes": [
            18,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28
          ],
          "matchedWords": [
            "最",
            "后",
            "让",
            "小",
            "鼠",
            "的",
            "胡",
            "须",
            "动",
            "了",
            "一下"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.8558,
          "interpolatedWordUnits": true
        },
        {
          "text": "这个故事，就是今年诺贝尔生理学或医学奖的核心。",
          "start": 6.14,
          "end": 10.18,
          "status": "exact",
          "timingSource": "whisper-word-boundary",
          "matchedChars": 21,
          "expectedChars": 21,
          "matchedRatio": 1,
          "confidence": 0.9642,
          "matchedWordIndexes": [
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            43,
            44,
            45,
            46
          ],
          "matchedWords": [
            "这个",
            "故",
            "事",
            "就是",
            "今年",
            "诺",
            "贝",
            "尔",
            "生",
            "理",
            "学",
            "或",
            "医",
            "学",
            "奖",
            "的",
            "核",
            "心"
          ],
          "unmatchedText": "",
          "extraRecognizedText": "",
          "extraRecognizedChars": 0,
          "meanWordProbability": 0.9642,
          "interpolatedWordUnits": true
        }
      ],
      "asrSpeechEnd": 10.18
    }
  ]
}

src/nobel2026/WorldV2.ts
   1 | import * as THREE from 'three';
   2 | import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
   3 | 
   4 | export type NobelState={scene:string;progress:number;line:number;lineProgress:number;time:number;previous?:string;elapsed?:number};
   5 | export const clamp=(n:number)=>Math.max(0,Math.min(1,n));
   6 | export const smooth=(n:number)=>{const x=clamp(n);return x*x*x*(x*(x*6-15)+10)};
   7 | const C={ink:0x183746,ivory:0xf4f0e5,blue:0x4389ff,cyan:0x55cfe8,gold:0xffc05a,green:0x43b97b,greenDark:0x126b4c,coral:0xee8c72,purple:0x9b83e6,white:0xf7fbf8,red:0xe86c67,slate:0x648a9b};
   8 | const std=(c:number,r=.45,m=0)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
   9 | const basic=(c:number,o=1)=>new THREE.MeshBasicMaterial({color:c,transparent:o<1,opacity:o,depthWrite:o>.65});
  10 | const glass=(c:number,o=.25)=>new THREE.MeshPhysicalMaterial({color:c,transparent:true,opacity:o,roughness:.25,transmission:.25,clearcoat:.5,side:THREE.DoubleSide});
  11 | const sphere=(r:number,m:THREE.Material)=>new THREE.Mesh(new THREE.SphereGeometry(r,24,16),m);
  12 | const tube=(points:THREE.Vector3[],c:number,r=.05,o=1)=>new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),64,r,10,false),basic(c,o));
  13 | const line=(points:THREE.Vector3[],c:number,o=1)=>new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),basic(c,o));
  14 | const cylBetween=(a:THREE.Vector3,b:THREE.Vector3,r:number,m:THREE.Material)=>{const v=new THREE.Vector3().subVectors(b,a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,v.length(),14),m);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return mesh;};
  15 | type GroupName='hook'|'context'|'algae'|'channel'|'neuron'|'brain'|'impact';
  16 | /* The voice timeline has a fixed number of clips per visual station.  Keeping
  17 |  * this map here makes every causal animation key off the same deterministic
  18 |  * (line + lineProgress) clock that drives the captions. */
  19 | const STEP_COUNT:Record<GroupName,number>={hook:2,context:1,algae:4,channel:4,neuron:4,brain:3,impact:4};
  20 | const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
  21 | const TARGET_ZOOM:Record<GroupName,number>={hook:1.13,context:1.13,algae:1.22,channel:1.15,neuron:1.10,brain:1.13,impact:1.13};
  22 | 
  23 | export class NobelWorldV2{
  24 |  renderer:THREE.WebGLRenderer; scene=new THREE.Scene(); camera:THREE.OrthographicCamera;
  25 |  groups:Record<GroupName,THREE.Group>={hook:new THREE.Group(),context:new THREE.Group(),algae:new THREE.Group(),channel:new THREE.Group(),neuron:new THREE.Group(),brain:new THREE.Group(),impact:new THREE.Group()};
  26 |  room=new THREE.Group();
  27 |  hookCells:THREE.Mesh[]=[]; contextCells:THREE.Mesh[]=[]; algae!:THREE.Group; algaeBody!:THREE.Mesh; algaeEye!:THREE.Mesh; algaeFlagella:THREE.Mesh[]=[]; algaeBeam!:THREE.Mesh;
  28 |  gate!:THREE.Mesh; gateDoor!:THREE.Mesh; gateGlow!:THREE.Mesh; ionTrail!:THREE.Line; ionArrow!:THREE.Mesh; ions:THREE.Mesh[]=[]; channelPhotons:THREE.Mesh[]=[]; channelMembrane!:THREE.Group; frog!:THREE.Mesh;
  29 |  neuronPath:THREE.Vector3[]=[]; neuronPulse:THREE.Mesh[]=[]; neuronPhotons:THREE.Mesh[]=[]; neuronLight!:THREE.Mesh; controlNeuron!:THREE.Group; trace!:THREE.Line; controlTrace!:THREE.Line;
  30 |  fiber!:THREE.Mesh; fiberPhotons:THREE.Mesh[]=[]; targetCells:THREE.Mesh[]=[]; offTargetCells:THREE.Mesh[]=[]; whiskers:THREE.Line[]=[]; whiskerBaseY:number[][]=[]; mouse!:THREE.Group; memoryCells:THREE.Mesh[]=[]; retina!:THREE.Group;
  31 |  constructor(canvas:HTMLCanvasElement,width=1920,height=1080){
  32 |   this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.setSize(width,height,false);this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;/* Keep the ivory paper bright while restoring separation between translucent teaching layers. */this.renderer.toneMappingExposure=1.14;
  33 |   this.camera=new THREE.OrthographicCamera(-4.5*width/height,4.5*width/height,4.5,-4.5,.1,100);this.camera.position.set(0,.2,16);this.camera.lookAt(0,0,0);
  34 |   const pm=new THREE.PMREMGenerator(this.renderer);const env=pm.fromScene(new RoomEnvironment(),.03);this.scene.environment=env.texture;pm.dispose();this.scene.background=new THREE.Color(C.ivory);this.scene.add(new THREE.HemisphereLight(0xffffff,0x9baeb2,1.75));const key=new THREE.DirectionalLight(0xfff2db,2.8);key.position.set(-5,8,8);this.scene.add(key);const fill=new THREE.DirectionalLight(0xc5edff,1.4);fill.position.set(7,3,-5);this.scene.add(fill);
  35 |   this.scene.add(this.room);Object.values(this.groups).forEach(g=>this.scene.add(g));this.buildRoom();this.buildHook();this.buildContext();this.buildAlgaeScene();this.buildChannel();this.buildNeuronScene();this.buildBrainScene();this.buildImpactScene();
  36 |  }
  37 |  buildRoom(){const f=new THREE.Mesh(new THREE.PlaneGeometry(60,40),std(0xe9e4d9,.92));f.rotation.x=-Math.PI/2;f.position.y=-3.35;f.receiveShadow=true;this.room.add(f);const halo=new THREE.Mesh(new THREE.CircleGeometry(5.5,64),basic(0xffffff,.16));halo.rotation.x=-Math.PI/2;halo.position.y=-3.32;this.room.add(halo);}
  38 |  buildBrainBase(g:THREE.Group,x=0,y=0,z=.2,scale=1){const brain=new THREE.Group();brain.scale.set(scale,scale*.82,scale);for(const dx of [-1.15,1.15]){const h=new THREE.Mesh(new THREE.SphereGeometry(1.85,42,26),new THREE.MeshStandardMaterial({color:0x6398ae,roughness:.4,transparent:true,opacity:.9}));h.scale.set(.98,.82,1);h.position.set(dx,0,0);brain.add(h);for(let i=0;i<7;i++){const a=i*Math.PI*2/7+.2;const pts=[new THREE.Vector3(dx+Math.cos(a)*.55,Math.sin(a)*.95-.15,.65),new THREE.Vector3(dx+Math.cos(a+.4)*1.05,Math.sin(a+.4)*1.25-.1,.7),new THREE.Vector3(dx+Math.cos(a+.75)*1.48,Math.sin(a+.75)*1.4-.1,.7)];brain.add(tube(pts,C.slate,.04,.72));}}brain.position.set(x,y,z);g.add(brain);return brain;}
  39 |  buildHook(){const g=this.groups.hook;this.buildBrainBase(g,0,.1,.2,.9);for(let i=0;i<9;i++){const n=sphere(.115,std(C.coral,.3,.05));const a=i/9*Math.PI*2;n.position.set(-.2+Math.cos(a)*.55,-.3+Math.sin(a)*.45,1.15);g.add(n);this.hookCells.push(n);}const ring=new THREE.Mesh(new THREE.TorusGeometry(.75,.035,12,64),basic(C.coral,.82));ring.position.set(-.2,-.3,1.12);g.add(ring);const beam=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,4.2,12),basic(C.blue,.65));beam.rotation.z=Math.PI/2;beam.position.set(-2.3,.9,.9);g.add(beam);}
  40 |  buildContext(){const g=this.groups.context;this.buildBrainBase(g,0,.1,.2,.95);for(let i=0;i<30;i++){const n=sphere(.075,basic(i<8?C.coral:C.cyan,.7));const a=i*.82,r=.55+(i%6)*.18;n.position.set(Math.cos(a)*r,Math.sin(a*1.37)*1.2-.25,1.1+Math.sin(a)*.18);g.add(n);this.contextCells.push(n);}const left=line([new THREE.Vector3(-3.2,-2.2,1),new THREE.Vector3(-.7,-2.2,1)],C.ink,.35);const right=line([new THREE.Vector3(.2,-2.2,1),new THREE.Vector3(3.2,-2.2,1)],C.coral,.65);g.add(left,right);}
  41 |  buildAlgaeScene(){
  42 |   const g=this.groups.algae;
  43 |   this.algae=new THREE.Group();this.algae.position.set(-.1,.05,.2);g.add(this.algae);
  44 |   const dish=new THREE.Mesh(new THREE.TorusGeometry(2.35,.08,16,72),glass(0x8dbcc2,.6));dish.rotation.x=Math.PI/2;dish.position.y=-1.65;g.add(dish);
  45 |   const shell=sphere(1.18,new THREE.MeshPhysicalMaterial({color:C.green,roughness:.3,transmission:.08,clearcoat:.7}));shell.scale.set(1.12,.84,.68);shell.position.set(-.85,0,0);this.algae.add(shell);this.algaeBody=shell;
  46 |   const chlor=new THREE.Mesh(new THREE.TorusGeometry(.85,.13,12,52),std(C.greenDark,.4));chlor.rotation.set(Math.PI/2,.25,.25);chlor.position.set(-.85,0,.08);this.algae.add(chlor);
  47 |   this.algaeEye=sphere(.2,new THREE.MeshPhysicalMaterial({color:C.gold,emissive:C.gold,emissiveIntensity:.75,roughness:.25}));this.algaeEye.position.set(-1.72,.28,.5);this.algae.add(this.algaeEye);
  48 |   for(const pts of [[new THREE.Vector3(.05,.28,.1),new THREE.Vector3(.8,.8,.2),new THREE.Vector3(1.8,.4,.3),new THREE.Vector3(2.5,.8,.4)],[new THREE.Vector3(.05,-.28,.1),new THREE.Vector3(.75,-.8,.2),new THREE.Vector3(1.7,-.5,.3),new THREE.Vector3(2.55,-.9,.4)]]){const f=tube(pts,C.green,.055,.95);this.algae.add(f);this.algaeFlagella.push(f);}
  49 |   this.algaeBeam=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,5.2,12),basic(C.blue,.34));this.algaeBeam.rotation.z=Math.PI/2;this.algaeBeam.position.set(-3.1,.48,.65);g.add(this.algaeBeam);
  50 |   for(let i=0;i<7;i++){const p=sphere(.045,basic(C.gold,.75));p.position.set(-2.5+i*.52,-1.1+Math.sin(i)*.12,.4);g.add(p);}
  51 |  }
  52 |  buildChannel(){
  53 |   const g=this.groups.channel;
  54 |   this.frog=sphere(1.28,glass(0x89d3b7,.72));this.frog.scale.set(1.15,.98,.82);this.frog.position.set(-2.15,.15,.1);g.add(this.frog);
  55 |   const eggRing=new THREE.Mesh(new THREE.TorusGeometry(1.3,.035,12,64),basic(C.green,.78));eggRing.scale.set(1.15,.98,1);eggRing.position.copy(this.frog.position);g.add(eggRing);
  56 |   const membrane=new THREE.Group();membrane.position.set(.9,.15,.2);membrane.rotation.y=-.65;this.channelMembrane=membrane;g.add(membrane);
  57 |   // The bilayer normal is local Z. Both tails point toward the mid-plane,
  58 |   // leaving a real pore rather than placing phospholipids across the opening.
  59 |   for(const z of [-.38,.38])for(let ix=-7;ix<=7;ix++)for(let iy=-3;iy<=3;iy++){
  60 |    const x=ix*.36,y=iy*.36*(1-.08*Math.abs(ix)/7);
  61 |    if(Math.hypot(x-.15,y)<.75)continue;
  62 |    const bead=sphere(.075,std(0x8cbab4,.58));bead.position.set(x,y,z);membrane.add(bead);
  63 |    const tail=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.42,8),std(0x648e91,.62));tail.rotation.x=Math.PI/2;tail.position.set(x,y,z>0?z-.2:z+.2);membrane.add(tail);
  64 |   }
  65 |   const ring=new THREE.Mesh(new THREE.TorusGeometry(.56,.14,18,56),std(C.cyan,.24,.12));ring.position.set(.15,0,.46);membrane.add(ring);this.gate=ring;
  66 |   const backRing=new THREE.Mesh(new THREE.TorusGeometry(.56,.12,18,56),std(C.cyan,.30,.08));backRing.position.set(.15,0,-.46);membrane.add(backRing);
  67 |   for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  68 |    const x=.15+Math.cos(a)*.57,y=Math.sin(a)*.57;
  69 |    membrane.add(cylBetween(new THREE.Vector3(x,y,-.43),new THREE.Vector3(x,y,.43),.095,std(C.cyan,.30,.08)));
  70 |   }
  71 |   // The closing iris is a short dark plug along the membrane normal. Its
  72 |   // local X/Z are radial to the cylinder, so those axes shrink when opened.
  73 |   this.gateDoor=new THREE.Mesh(new THREE.CylinderGeometry(.31,.31,.66,20),std(C.ink,.3,.08));this.gateDoor.rotation.x=Math.PI/2;this.gateDoor.position.set(.15,0,.48);membrane.add(this.gateDoor);
  74 |   this.gateGlow=new THREE.Mesh(new THREE.TorusGeometry(.78,.045,12,52),basic(C.blue,.2));this.gateGlow.position.set(.15,0,.5);membrane.add(this.gateGlow);
  75 |   this.ionTrail=line([new THREE.Vector3(.15,0,1.42),new THREE.Vector3(.15,0,-1.6)],C.gold,.32);membrane.add(this.ionTrail);
  76 |   this.ionArrow=new THREE.Mesh(new THREE.ConeGeometry(.13,.28,14),basic(C.gold,.55));this.ionArrow.rotation.x=-Math.PI/2;this.ionArrow.position.set(.15,0,-1.55);membrane.add(this.ionArrow);
  77 |   for(let i=0;i<14;i++){const ion=sphere(.09,new THREE.MeshPhysicalMaterial({color:i%3===0?C.cyan:C.gold,emissive:i%3===0?C.cyan:C.gold,emissiveIntensity:.3,roughness:.22}));membrane.add(ion);this.ions.push(ion);}
  78 |   for(let i=0;i<5;i++){const photon=sphere(.065,basic(C.blue,.9));membrane.add(photon);this.channelPhotons.push(photon);}
  79 |   const dna=new THREE.Group();for(let i=0;i<12;i++){const y=-1.55+i*.25,a=i*.65;const pa=sphere(.06,basic(C.purple,.75));pa.position.set(-2.1+Math.sin(a)*.35,y,1);dna.add(pa);const pb=sphere(.06,basic(C.gold,.75));pb.position.set(-2.1-Math.sin(a)*.35,y,1);dna.add(pb);dna.add(line([new THREE.Vector3(-2.1+Math.sin(a)*.35,y,1),new THREE.Vector3(-2.1-Math.sin(a)*.35,y,1)],C.white,.45));}g.add(dna);
  80 |  }
  81 |  buildNeuronScene(){
  82 |   const g=this.groups.neuron;
  83 |   const dish=new THREE.Mesh(new THREE.TorusGeometry(3.25,.08,18,80),glass(0x92bec4,.65));dish.rotation.x=Math.PI/2;dish.position.y=-1.8;g.add(dish);
  84 |   const soma=sphere(.62,new THREE.MeshPhysicalMaterial({color:C.coral,roughness:.32,clearcoat:.7}));soma.position.set(-2.4,0,.25);g.add(soma);
  85 |   for(const pts of [[new THREE.Vector3(-1.95,.2,.3),new THREE.Vector3(-1.2,.7,.35),new THREE.Vector3(-.6,.35,.4)],[new THREE.Vector3(-1.95,-.15,.3),new THREE.Vector3(-1.3,-.8,.35),new THREE.Vector3(-.6,-.35,.4)]])g.add(tube(pts,C.purple,.065,.92));
  86 |   const p0=[new THREE.Vector3(-1.9,0,.35),new THREE.Vector3(-.8,.04,.4),new THREE.Vector3(.35,-.03,.4),new THREE.Vector3(1.5,.12,.45),new THREE.Vector3(3.05,.08,.5)];
  87 |   this.neuronPath=new THREE.CatmullRomCurve3(p0).getPoints(110);g.add(tube(p0,C.purple,.075,.94));
  88 |   for(let i=0;i<12;i++){const p=sphere(.105,basic(C.gold,.95));g.add(p);this.neuronPulse.push(p);}
  89 |   this.neuronLight=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,3.4,12),basic(C.blue,.14));this.neuronLight.position.set(-.8,2.05,.8);g.add(this.neuronLight);
  90 |   for(let i=0;i<5;i++){const photon=sphere(.065,basic(C.blue,.9));g.add(photon);this.neuronPhotons.push(photon);}
  91 |   const control=new THREE.Group();const csoma=sphere(.32,glass(C.slate,.5));csoma.position.set(-1.15,-1.12,.35);control.add(csoma);control.add(tube([new THREE.Vector3(-.85,-1.12,.35),new THREE.Vector3(.05,-1.12,.36),new THREE.Vector3(1.05,-1.08,.38)],C.slate,.045,.62));this.controlNeuron=control;g.add(control);
  92 |   const tracePts:THREE.Vector3[]=[],controlPts:THREE.Vector3[]=[];
  93 |   for(let i=0;i<90;i++){
  94 |    const x=-1.8+i*.055;
  95 |    const y=-2.45+Math.sin(i*.12)*.03+Math.exp(-Math.pow((i-30)/6,2))*1.15+Math.exp(-Math.pow((i-63)/5,2))*1.0;
  96 |    tracePts.push(new THREE.Vector3(x,y,.5));controlPts.push(new THREE.Vector3(x,-3.07,.5));
  97 |   }
  98 |   this.trace=line(tracePts,C.red,.94);this.trace.geometry.setDrawRange(0,25);
  99 |   this.controlTrace=line(controlPts,C.slate,.72);g.add(this.trace,this.controlTrace);
 100 |  }
 101 |  buildBrainScene(){
 102 |   const g=this.groups.brain;
 103 |   // This is a cutaway of the stimulated cortex, not a giant opaque brain
 104 |   // hovering over the animal.  The thin shell leaves the labelled cells legible.
 105 |   const brain=this.buildBrainBase(g,-1.05,.45,.05,.68);
 106 |   brain.traverse(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial){o.material.opacity=.18;o.material.depthWrite=false;o.material.side=THREE.DoubleSide;}});
 107 |   const skull=new THREE.Mesh(new THREE.SphereGeometry(1.95,32,20,0,Math.PI*2,0,Math.PI*.55),new THREE.MeshBasicMaterial({color:C.cyan,transparent:true,opacity:.075,wireframe:true,depthWrite:false,side:THREE.DoubleSide}));skull.position.set(-1.05,.48,.55);g.add(skull);
 108 |   this.fiber=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,2.8,14),basic(C.blue,.75));this.fiber.position.set(-.86,2.14,1.25);g.add(this.fiber);
 109 |   const tip=sphere(.13,basic(C.blue,.95));tip.position.set(-.86,.75,1.25);g.add(tip);
 110 |   for(let i=0;i<5;i++){const photon=sphere(.075,basic(C.blue,.95));g.add(photon);this.fiberPhotons.push(photon);}
 111 |   for(let i=0;i<9;i++){const n=sphere(.12,std(C.coral,.3,.05));const a=i/9*Math.PI*2;n.position.set(-.86+Math.cos(a)*.48,.12+Math.sin(a)*.36,1.42);g.add(n);this.targetCells.push(n);}
 112 |   for(let i=0;i<8;i++){const n=sphere(.085,glass(C.slate,.32));const a=i/8*Math.PI*2;n.position.set(-.86+Math.cos(a)*.88,.12+Math.sin(a)*.65,1.31);g.add(n);this.offTargetCells.push(n);}
 113 |   // All animal features, especially the whisker roots, share one transform.
 114 |   // The response changes the distal points only, so no whisker detaches.
 115 |   this.mouse=new THREE.Group();this.mouse.position.set(.65,-1.5,.5);g.add(this.mouse);
 116 |   const body=sphere(.62,std(C.ink,.52));body.scale.set(1.55,.78,.78);body.position.set(-.12,-.05,0);this.mouse.add(body);
 117 |   const head=sphere(.37,std(C.ink,.52));head.scale.set(1.13,.93,.88);head.position.set(.72,.14,.14);this.mouse.add(head);
 118 |   const ear=sphere(.18,std(C.slate,.5));ear.scale.set(.68,1,.54);ear.position.set(.54,.47,.35);this.mouse.add(ear);
 119 |   const eye=sphere(.055,basic(C.white,.95));eye.position.set(.98,.23,.49);this.mouse.add(eye);
 120 |   const nose=sphere(.085,std(C.ink,.28));nose.position.set(1.12,.06,.46);this.mouse.add(nose);
 121 |   this.mouse.add(tube([new THREE.Vector3(-.95,-.03,.02),new THREE.Vector3(-1.35,.13,.12),new THREE.Vector3(-1.57,.28,.08)],C.slate,.055,.9));
 122 |   for(const x of [-.46,.32]){const foot=sphere(.17,std(C.ink,.5));foot.scale.set(1.1,.35,.72);foot.position.set(x,-.53,.25);this.mouse.add(foot);}
 123 |   for(let i=0;i<6;i++){
 124 |    const side=i<3?1:-1,offset=i%3-1;
 125 |    const pts=[new THREE.Vector3(1.13,.06,.48),new THREE.Vector3(1.47,.06+offset*.12,.51+side*.035),new THREE.Vector3(1.83,.07+offset*.22,.48+side*.08)];
 126 |    const w=line(pts,C.gold,.92);this.mouse.add(w);this.whiskers.push(w);this.whiskerBaseY.push(pts.map(v=>v.y));
 127 |   }
 128 |  }
 129 |  buildImpactScene(){const g=this.groups.impact;this.buildBrainBase(g,-1.1,.2,.2,.72);const loopPts=[];for(let i=0;i<8;i++){const a=i*Math.PI*2/8;const n=sphere(.13,std(i%2?C.coral:C.purple,.3));n.position.set(-1.15+Math.cos(a)*1.05,.2+Math.sin(a)*.82,1.1);g.add(n);this.memoryCells.push(n);loopPts.push(n.position.clone());}loopPts.push(loopPts[0].clone());g.add(line(loopPts,C.coral,.55));const eye=new THREE.Group();eye.position.set(2.25,.1,.2);eye.add(sphere(1.0,glass(0xd9edf0,.68)));const iris=new THREE.Mesh(new THREE.TorusGeometry(.34,.12,16,48),std(C.cyan,.25));iris.position.z=.95;eye.add(iris);const pupil=sphere(.17,std(C.ink,.3));pupil.position.z=1.06;eye.add(pupil);g.add(eye);this.retina=eye;const arrow=line([new THREE.Vector3(1.05,.1,.5),new THREE.Vector3(1.8,.1,.5)],C.gold,.8);g.add(arrow);}
 130 |  station(n:string):[number,number]{const p:Record<string,[number,number]>={hook:[0,.1],context:[.1,.05],algae:[-.35,.05],channel:[.1,.1],neuron:[.15,.05],brain:[0,.05],impact:[0,.05]};return p[n]??[0,0];}
 131 |  setPos(g:THREE.Group,x:number,y:number,scale=1){g.position.set(x,y,0);g.scale.setScalar(scale);}
 132 |  render(s:NobelState){
 133 |   const scene=s.scene as GroupName,p=clamp(s.progress),t=s.time,prev=s.previous as GroupName|undefined,elapsed=s.elapsed??2;
 134 |   const transitioning=!!prev&&prev!==scene,trans=transitioning?clamp(elapsed/1.2):1,q=smooth(trans);
 135 |   const stepCount=STEP_COUNT[scene]??1;
 136 |   /* One deterministic clock for visuals and captions: a visual event never
 137 |    * starts before the spoken clip that introduces it. */
 138 |   const voiceStep=clamp((Math.max(0,s.line)+clamp(s.lineProgress))/stepCount);
 139 |   const [sx,sy]=this.station(scene),cur=this.groups[scene],travel=13.5;
 140 |   for(const n of Object.keys(this.groups) as GroupName[])this.groups[n].rotation.set(0,0,0);
 141 |   if(cur){const entering=transitioning?1-q:0;this.setPos(cur,sx+travel*entering,sy,(scene==='brain'||scene==='impact'?.94:1)*(.965+.035*q));cur.rotation.z=.045*entering;cur.rotation.y=.018*entering;}
 142 |   if(transitioning){const [px,py]=this.station(prev!);const exiting=q;this.setPos(this.groups[prev!],px-travel*exiting,py,(prev==='brain'||prev==='impact'?.94:1)*(.985+.015*(1-q)));this.groups[prev!].rotation.z=-.035*exiting;this.groups[prev!].rotation.y=-.014*exiting;}
 143 |   const [px,py]=transitioning?this.station(prev!):[sx,sy];
 144 |   const cameraX=transitioning?mix(px,sx,q):sx;
 145 |   const targetZoom=TARGET_ZOOM[scene]??1.13,fromZoom=transitioning?(TARGET_ZOOM[prev!]??1.13):targetZoom;
 146 |   this.camera.position.x=cameraX+.1*Math.sin(t*.25);this.camera.position.y=.25+.06*Math.sin(t*.21);this.camera.position.z=16;this.camera.zoom=transitioning?mix(fromZoom,targetZoom,q):targetZoom;this.camera.lookAt(this.camera.position.x*.04,0,0);this.camera.updateProjectionMatrix();
 147 |   /* Hide an outgoing group only after its full geometry has crossed the view
 148 |    * edge.  A fixed travel distance of 13.5 world units is wider than the
 149 |    * orthographic half-width plus the largest model radius at every zoom. */
 150 |   const halfW=Math.abs(this.camera.right-this.camera.left)/(2*Math.max(.01,this.camera.zoom)),modelRadius=4.2;
 151 |   for(const n of Object.keys(this.groups) as GroupName[]){if(n===scene)this.groups[n].visible=true;else if(transitioning&&n===prev)this.groups[n].visible=Math.abs(this.groups[n].position.x-this.camera.position.x)<halfW+modelRadius;else this.groups[n].visible=false;}
 152 |   this.hookCells.forEach((n,i)=>n.scale.setScalar(.8+1.4*smooth(.5+.5*Math.sin(t*2.3+i))));this.contextCells.forEach((n,i)=>{const a=scene==='context'?smooth(p*1.5-i*.018):.1;n.scale.setScalar(.7+1.8*a);(n.material as THREE.MeshBasicMaterial).opacity=.22+.76*a;});
 153 |   this.algaeBody.rotation.z=.12*Math.sin(t*.75);this.algaeFlagella.forEach((f,i)=>f.rotation.z=.13*Math.sin(t*2+i));this.algaeEye.scale.setScalar(.9+.18*Math.sin(t*2.4));this.algaeBeam.material&&((this.algaeBeam.material as THREE.MeshBasicMaterial).opacity=.18+.38*(.5+.5*Math.sin(t*2.1)));
 154 |   const channelStep=scene==='channel'?voiceStep:0,open=scene==='channel'?smooth(clamp((channelStep-.18)/.27)):0;/* Closing plug shrinks in XY; depth alone is invisible from the membrane-facing camera. */const poreScale=Math.max(.12,1-.88*open);this.gateDoor.scale.set(poreScale,poreScale,.2+.85*open);this.gateGlow.scale.setScalar(.8+1.4*open);(this.gateGlow.material as THREE.MeshBasicMaterial).opacity=.08+.48*open;(this.ionTrail.material as THREE.LineBasicMaterial).opacity=.08+.24*open;(this.ionArrow.material as THREE.MeshBasicMaterial).opacity=.12+.5*open;this.channelMembrane.rotation.z=.018*Math.sin(t*.45);this.ions.forEach((ion,i)=>{const u=(channelStep*1.35+i/this.ions.length)%1;ion.position.set(.15+(i%4-1.5)*.12,.02+((i*17)%5-.5)*.08,.45-u*2.5);ion.visible=scene==='channel'&&open>.04&&u<.88;(ion.material as THREE.MeshPhysicalMaterial).opacity=.72+.28*open;});this.channelPhotons.forEach((ph,i)=>{const u=(channelStep*.92+i/this.channelPhotons.length)%1;ph.position.set(-2.6+u*3.05,.58+.05*Math.sin(i),.82);ph.visible=scene==='channel'&&open>.02&&u<.95;});this.frog.scale.setScalar(1+.035*Math.sin(t*1.6));
 155 |   const neuronStep=scene==='neuron'?voiceStep:0,stimulusIn=smooth(clamp((neuronStep-.24)/.045)),stimulusOut=1-smooth(clamp((neuronStep-.72)/.10)),stimulus=stimulusIn*stimulusOut,pulsePhase=smooth(clamp((neuronStep-.24)/.48));this.neuronPulse.forEach((n,i)=>{const u=(pulsePhase*1.45+i/this.neuronPulse.length)%1;n.visible=scene==='neuron'&&stimulus>.04;n.position.copy(this.neuronPath[Math.min(this.neuronPath.length-1,Math.floor(u*(this.neuronPath.length-1)))!]);n.scale.setScalar(.65+1.3*Math.exp(-Math.pow((u-.48)*4,2))*stimulus);});this.neuronPhotons.forEach((ph,i)=>{const u=(pulsePhase*1.1+i/this.neuronPhotons.length)%1;ph.position.set(-.8,3.58-u*3.18,.86);ph.visible=scene==='neuron'&&stimulus>.04&&u<.92;});(this.neuronLight.material as THREE.MeshBasicMaterial).opacity=.14+.58*(.5+.5*Math.sin(t*3))*stimulus;this.controlNeuron.scale.setScalar(.9+.05*Math.sin(t));
 156 |   const brainStep=scene==='brain'?voiceStep:0,brainReveal=smooth(clamp((brainStep-.18)/.22));this.targetCells.forEach((n,i)=>n.scale.setScalar(.8+1.5*smooth(brainReveal*1.6-i*.055)));this.fiber.rotation.z=.025*Math.sin(t*.7);const fiberPhase=smooth(clamp((brainStep-.05)/.55));this.fiberPhotons.forEach((ph,i)=>{const u=(fiberPhase*.8+i/this.fiberPhotons.length)%1;ph.position.set(-.2,3.88-u*3.0,1.1);ph.visible=scene==='brain'&&brainReveal>.03&&u<.9;});this.whiskers.forEach((w,i)=>{const pts=w.geometry.getAttribute('position'),base=this.whiskerBaseY[i]??[];if(pts.count>1)pts.setY(1,(base[1]??pts.getY(1))+.08*Math.sin(t*4+i*.3));pts.needsUpdate=true;});const impactStep=scene==='impact'?voiceStep:0,impactReveal=smooth(clamp((impactStep-.08)/.25));this.memoryCells.forEach((n,i)=>n.scale.setScalar(.85+1.6*smooth((impactReveal*1.8-i*.08)%1)));if(this.retina)this.retina.rotation.y=.12*Math.sin(t*.5);
 157 |   this.renderer.render(this.scene,this.camera);
 158 |  }
 159 |  dispose(){this.scene.traverse(o=>{const x=o as THREE.Mesh;if(x.geometry)x.geometry.dispose();const m=(x as any).material;if(m){for(const a of (Array.isArray(m)?m:[m]))a.dispose();}});this.renderer.dispose();this.renderer.forceContextLoss();}
 160 | }
 161 | 

src/nobel2026/FilmV3.tsx
   1 | import React,{useLayoutEffect,useRef} from 'react';
   2 | import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame} from 'remotion';
   3 | import {NobelWorldV2,NobelState,clamp,smooth} from './WorldV2';
   4 | import timeline from './timeline-v3.json';
   5 | 
   6 | const ink='#183746',muted='#5f7680',cyan='#168da8',gold='#d8943d',paper='#fffdf8';
   7 | const scenes=(timeline as any).scenes, clips=(timeline as any).clips;
   8 | function stateAt(frame:number):NobelState{const idx=Math.max(0,scenes.findIndex((s:any)=>frame>=s.start&&frame<s.end));const scene=scenes[idx]??scenes[scenes.length-1];const cs=clips.filter((c:any)=>c.scene===scene.id);const clip=cs.filter((c:any)=>frame>=c.start).at(-1)??cs[0];return {scene:scene.id,progress:clamp((frame-scene.start)/Math.max(1,scene.end-scene.start)),line:clip?cs.indexOf(clip):0,lineProgress:clip?clamp((frame-clip.start)/Math.max(1,clip.end-clip.start)):0,time:frame/30,previous:scenes[idx-1]?.id,elapsed:(frame-scene.start)/30};}
   9 | function Stage({state}:{state:NobelState}){const ref=useRef<HTMLCanvasElement>(null),world=useRef<NobelWorldV2|null>(null);useLayoutEffect(()=>{world.current=new NobelWorldV2(ref.current!);return()=>{world.current?.dispose();world.current=null}},[]);useLayoutEffect(()=>{world.current?.render(state)},[state]);
  10 |   // A barely perceptible camera drift keeps the continuous Three.js stage alive
  11 |   // while the editorial layer stays locked for legibility.  The easing is
  12 |   // deterministic, so stills and the final render use identical framing.
  13 |   const driftX=2.8*Math.sin(state.time*.21), driftY=1.8*Math.cos(state.time*.17);
  14 |   const scale=1.008+0.004*Math.sin(state.time*.13);
  15 |   return <canvas ref={ref} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%',transform:`translate3d(${driftX}px,${driftY}px,0) scale(${scale})`,transformOrigin:'50% 52%'}}/>;}
  16 | function Brand(){return <div style={{position:'absolute',left:58,top:42,zIndex:10,display:'flex',alignItems:'center',gap:16,color:ink,fontFamily:'"Microsoft YaHei",sans-serif',fontSize:39,fontWeight:700,letterSpacing:.5}}><img src={staticFile('nobel2026/logo.png')} alt="rainbow鱼" style={{width:62,height:74,objectFit:'contain'}}/><span>rainbow鱼</span></div>;}
  17 | const titles:Record<string,string>={hook:'如果只叫醒一小群细胞？',context:'从“相关”走到“因果”',algae:'答案先从一滴绿水里游来',channel:'让蛙卵长出一扇光控的门',neuron:'把这把门装进神经元',brain:'光纤伸进活体脑内',impact:'一束光，开始拆分神经回路',references:'一条可以反复验证的因果链'};
  18 | const titleSubs:Record<string,string>={hook:'2026 诺贝尔生理学或医学奖 · 光遗传学',context:'一整片亮起 ≠ 找到真正的起点',algae:'Chlamydomonas · 眼点 · 约 0.5 ms',channel:'Xenopus 卵母细胞 · ChR2 · 约 0.2 ms',neuron:'Boyden et al. · 2005 · 透明容器神经元',brain:'Aravanis et al. · 2007 · 473 nm 光纤',impact:'研究工具与临床探索的边界',references:'for their discoveries concerning light-gated ion channels and optogenetics'};
  19 | function SceneTitle({state}:{state:NobelState}){
  20 |  const q=smooth(clamp((state.elapsed??0)/1.0));
  21 |  const current=state.scene, previous=state.previous&&titles[state.previous]?state.previous:undefined;
  22 |  const label=(scene:string,enter:boolean)=><div style={{position:'absolute',inset:0,transform:`translate3d(${enter?900*(1-q):-900*q}px,${enter?12*(1-q):0}px,0)`,opacity:enter?.86+.14*q:1-q}}><div style={{fontSize:scene==='hook'?78:66,fontWeight:760,letterSpacing:-2,lineHeight:1.15}}>{titles[scene]}</div><div style={{fontSize:30,color:scene==='impact'?gold:cyan,marginTop:13,letterSpacing:.4}}>{titleSubs[scene]}</div></div>;
  23 |  return <div style={{position:'absolute',left:110,top:145,zIndex:7,color:ink,width:1540,height:155,overflow:'visible'}}>{previous&&label(previous,false)}{label(current,true)}</div>;
  24 | }
  25 | function Scientists({state}:{state:NobelState}){if(state.scene!=='hook')return null;const q=smooth(clamp((state.elapsed??0)/.95));return <div style={{position:'absolute',right:112,top:272,zIndex:7,color:ink,transform:`translate3d(${34*(1-q)}px,0,0)`,opacity:.8+.2*q,textAlign:'right'}}><div style={{fontSize:25,letterSpacing:1,color:cyan,fontWeight:700}}>2026 NOBEL LAUREATES</div><div style={{fontSize:34,marginTop:10,fontWeight:650,letterSpacing:.2}}>Karl Deisseroth&nbsp; · &nbsp;Peter Hegemann&nbsp; · &nbsp;Georg Nagel</div></div>;}
  26 | function parts(text:string){return text.match(/[^。！？；：]+[。！？；：]?/g)?.map(s=>s.trim()).filter(Boolean)??[text];}
  27 | type CaptionPart={text:string;start?:number;end?:number};
  28 | /**
  29 |  * Display the same sentence that was sent to TTS, at the relative time where
  30 |  * Whisper found it in the processed clip.  Older timelines without
  31 |  * `subtitleParts` still fall back to punctuation units, so previews remain
  32 |  * renderable while a new alignment audit is being produced.
  33 |  */
  34 | function Caption({text,progress,clip,bottom=46}:{text:string;progress:number;clip?:any;bottom?:number}){
  35 |  const fallback:CaptionPart[]=parts(text).map(x=>({text:x}));
  36 |  const ps:CaptionPart[]=Array.isArray(clip?.subtitleParts)&&clip.subtitleParts.length?clip.subtitleParts:fallback;
  37 |  const clipSeconds=clip?Math.max(.001,(clip.end-clip.start)/30):1;
  38 |  const elapsed=clamp(progress)*clipSeconds;
  39 |  // End captions shortly after the measured speech, rather than holding the
  40 |  // last sentence across a visual pause.
  41 |  const speechEnd=Number(clip?.asrSpeechEnd??clipSeconds);
  42 |  if(clip && elapsed>speechEnd+0.16)return null;
  43 |  let idx=ps.findIndex(p=>p.start!==undefined&&elapsed>=Number(p.start)&&elapsed<Number(p.end??Infinity));
  44 |  if(idx<0){
  45 |    // A measured pause is a pause on screen too. Only the final syllable gets
  46 |    // a brief visual hold; older behavior showed the last line through every
  47 |    // mid-sentence breath and made captions appear ahead of the voice.
  48 |    const last=ps.length-1;
  49 |    const lastEnd=Number(ps[last]?.end);
  50 |    if(Number.isFinite(lastEnd)&&elapsed>=lastEnd&&elapsed<=lastEnd+0.12)idx=last;
  51 |    else if(ps.some(p=>p.start===undefined))idx=Math.min(last,Math.floor(clamp(progress)*ps.length));
  52 |    else return null;
  53 |  }
  54 |  const current=ps[Math.max(0,idx)]??{text};
  55 |  const start=Number(current.start??(idx/Math.max(1,ps.length))*clipSeconds);
  56 |  const end=Number(current.end??((idx+1)/Math.max(1,ps.length))*clipSeconds);
  57 |  const local=clamp((elapsed-start)/Math.max(.001,end-start));
  58 |  return <div style={{position:'absolute',left:90,right:90,bottom,zIndex:9,display:'flex',justifyContent:'center',pointerEvents:'none'}}><div key={`${clip?.id??'caption'}-${idx}`} style={{fontFamily:'"Microsoft YaHei",sans-serif',fontSize:46,fontWeight:600,lineHeight:1.24,color:'#fffdf7',background:'rgba(24,55,70,.93)',borderRadius:15,padding:'13px 30px',maxWidth:1420,textAlign:'center',boxShadow:'0 14px 30px rgba(24,55,70,.2)',opacity:.84+.16*smooth(local/.18),transform:`translateY(${6*(1-smooth(local/.18))}px)`}}>{current.text}</div></div>;
  59 | }
  60 | type EvidenceSpec={src:string;title:string;kind:'official'|'rebuild'};
  61 | const evidenceByScene:Record<string,EvidenceSpec>={
  62 |  algae:{src:'nobel2026/POP_Fig_2.jpg',title:'衣藻眼点与趋光反应',kind:'official'},
  63 |  channel:{src:'nobel2026/POP_Fig_3_ENG_01.jpg',title:'基因进入蛙卵，膜上表达通道',kind:'official'},
  64 |  neuron:{src:'nobel2026/POP_Fig_4_ENG_01.jpg',title:'培养神经元的光刺激读出',kind:'official'},
  65 |  brain:{src:'nobel2026/POP_Fig_5_ENG_01.jpg',title:'活体小鼠运动皮层实验',kind:'official'}
  66 | };
  67 | function EvidenceCard({spec,state,enter}:{spec:EvidenceSpec;state:NobelState;enter:boolean}){
  68 |  const q=smooth(clamp((state.elapsed??0)/1.2));
  69 |  const drift=8*Math.sin((state.lineProgress??0)*Math.PI);
  70 |  const x=enter?560*(1-q)+drift:-560*q;
  71 |  const opacity=enter?.76+.24*q:1-q;
  72 |  return <div style={{position:'absolute',right:110,bottom:158,zIndex:6,width:500,padding:10,background:'rgba(255,253,248,.94)',boxShadow:'0 18px 40px rgba(24,55,70,.18)',opacity,transform:`translate3d(${x}px,0,0) rotate(1deg)`}}>
  73 |   <Img src={staticFile(spec.src)} alt={spec.title} style={{display:'block',width:'100%',height:270,objectFit:'cover',objectPosition:'top center'}}/>
  74 |   <div style={{fontSize:29,fontWeight:700,color:ink,marginTop:10,lineHeight:1.2}}>{spec.title}</div>
  75 |  </div>;
  76 | }
  77 | function Evidence({state}:{state:NobelState}){
  78 |  const current=evidenceByScene[state.scene];
  79 |  const previous=state.previous?evidenceByScene[state.previous]:undefined;
  80 |  return <>{previous&&<EvidenceCard spec={previous} state={state} enter={false}/>} {current&&<EvidenceCard spec={current} state={state} enter={true}/>}</>;
  81 | }
  82 | function Callout({state}:{state:NobelState}){
  83 |  const intro=smooth(clamp((state.elapsed??0)/.72));
  84 |  const cfg:Record<string,{head:string;color:string}>={
  85 |   context:{head:'相关 → 因果',color:cyan},
  86 |   algae:{head:'先看行为，再追电流',color:cyan},
  87 |   channel:{head:'蓝光 → 通道 → 离子流',color:gold},
  88 |   neuron:{head:'光脉冲 → 动作电位',color:cyan},
  89 |   brain:{head:'473 nm 光纤进入活体脑',color:gold},
  90 |   impact:{head:'研究工具 · 临床仍在探索',color:gold}
  91 |  };
  92 |  const x=cfg[state.scene],old=state.previous?cfg[state.previous]:undefined;
  93 |  if(!x&&!old)return null;
  94 |  const card=(item:{head:string;color:string},style:React.CSSProperties)=><div style={{position:'absolute',left:110,bottom:180,zIndex:7,maxWidth:680,padding:'17px 23px',background:'rgba(255,253,248,.88)',borderLeft:`5px solid ${item.color}`,boxShadow:'0 12px 25px rgba(24,55,70,.09)',color:item.color,fontSize:36,fontWeight:700,letterSpacing:.3,...style}}>{item.head}</div>;
  95 |  return <>{old&&old!==x&&card(old,{transform:`translate3d(${-760*intro}px,0,0)`,opacity:1-intro})}{x&&card(x,{transform:`translate3d(${760*(1-intro)}px,0,0)`,opacity:.82+.18*intro})}</>;
  96 | }
  97 | function MechanismLegend({state}:{state:NobelState}){
  98 |  const intro=smooth(clamp((state.elapsed??0)/.6));
  99 |  const motion={transform:`translate3d(${38*(1-intro)}px,0,0)`,opacity:.82+.18*intro};
 100 |  if(state.scene==='channel')return <div style={{position:'absolute',left:760,top:650,zIndex:7,display:'flex',alignItems:'center',gap:12,padding:'11px 18px',borderRadius:999,background:'rgba(255,253,248,.86)',boxShadow:'0 10px 22px rgba(24,55,70,.10)',color:ink,fontSize:29,fontWeight:700,...motion}}><span style={{color:cyan}}>细胞外</span><span style={{color:gold}}>→</span><span style={{color:cyan}}>细胞内</span></div>;
 101 |  if(state.scene==='neuron')return <div style={{position:'absolute',left:780,top:770,zIndex:7,display:'flex',gap:16,alignItems:'center',padding:'10px 17px',borderRadius:999,background:'rgba(255,253,248,.88)',boxShadow:'0 10px 22px rgba(24,55,70,.10)',fontSize:27,fontWeight:700,color:ink,...motion}}><span style={{color:cyan}}>蓝光</span><span style={{color:gold}}>电信号</span><span style={{color:'#648a9b'}}>对照</span></div>;
 102 |  if(state.scene==='brain')return <div style={{position:'absolute',left:840,top:690,zIndex:7,padding:'10px 17px',borderRadius:999,background:'rgba(255,253,248,.84)',boxShadow:'0 10px 22px rgba(24,55,70,.10)',fontSize:29,fontWeight:700,color:cyan,...motion}}>473 nm 光纤</div>;
 103 |  return null;
 104 | }
 105 | function References({state}:{state:NobelState}){
 106 |  const entrance=smooth(clamp((state.elapsed??0)/1.25));
 107 |  const evidenceEntrance=smooth(clamp(((state.elapsed??0)-.75)/.9));
 108 |  return <AbsoluteFill style={{background:'#f4f0e5',fontFamily:'"Microsoft YaHei",sans-serif',color:ink,overflow:'hidden'}}>
 109 |   <Stage state={state}/>
 110 |   <AbsoluteFill style={{background:`rgba(231,238,240,${.91*entrance})`,pointerEvents:'none'}}/>
 111 |   <Brand/><SceneTitle state={state}/><Callout state={state}/>
 112 |   <div style={{position:'absolute',left:110,top:315,zIndex:5,display:'flex',gap:26,alignItems:'flex-start',opacity:.8+.2*entrance,transform:`translate3d(${1810*(1-entrance)}px,0,0)`}}>
 113 |    <Paper src="nobel2026/POP_Fig_3_ENG_01.jpg" title="基因进入蛙卵 · 光控通道" meta="NobelPrize.org Popular Information · 2026" rotate={-2}/>
 114 |    <Paper src="nobel2026/POP_Fig_4_ENG_01.jpg" title="透明容器神经元 · 2005" meta="Boyden et al. · Nature Neuroscience" rotate={1.2}/>
 115 |    <Paper src="nobel2026/POP_Fig_5_ENG_01.jpg" title="活体小鼠 · 2007" meta="Aravanis et al. · Journal of Neural Engineering" rotate={-1}/>
 116 |   </div>
 117 |   <div style={{position:'absolute',right:118,top:330,zIndex:7,width:430,opacity:.8+.2*evidenceEntrance,transform:`translate3d(${620*(1-evidenceEntrance)}px,0,0)`}}>
 118 |    <div style={{fontSize:21,color:cyan,letterSpacing:1}}>MECHANISM / EVIDENCE</div>
 119 |    <div style={{marginTop:10,padding:'20px 24px',background:'rgba(255,253,248,.94)',boxShadow:'0 18px 35px rgba(24,55,70,.13)',fontSize:30,lineHeight:1.42,fontWeight:680}}>蓝光<br/>↓<br/>光控阳离子通道<br/>↓<br/>膜电位改变<br/>↓<br/>神经信号与行为</div>
 120 |   </div>
 121 |   <div style={{position:'absolute',left:110,right:110,bottom:70,zIndex:8,display:'flex',justifyContent:'space-between',gap:30,alignItems:'flex-end',opacity:entrance,transform:`translate3d(0,${40*(1-entrance)}px,0)`}}>
 122 |    <div style={{fontSize:24,color:muted,lineHeight:1.4}}>关键论文：Nagel 2003 · Boyden 2005 · Aravanis 2007<br/>可视化：Three.js · Remotion</div>
 123 |    <div style={{fontSize:24,color:muted,textAlign:'right'}}>官方插图：NobelPrize.org<br/>Mattias Karlén</div>
 124 |   </div>
 125 |  </AbsoluteFill>;
 126 | }
 127 | function Paper({src,title,meta,rotate}:{src:string;title:string;meta:string;rotate:number}){return <div style={{width:330,transform:`rotate(${rotate}deg)`}}><div style={{padding:11,background:paper,boxShadow:'0 20px 42px rgba(24,55,70,.18)'}}><Img src={staticFile(src)} style={{display:'block',width:'100%',height:235,objectFit:'cover',objectPosition:'top center'}}/></div><div style={{marginTop:12,paddingLeft:4,color:ink}}><div style={{fontSize:26,fontWeight:700,lineHeight:1.18}}>{title}</div><div style={{fontSize:22,color:muted,lineHeight:1.25,marginTop:6}}>{meta}</div></div></div>;}
 128 | export function NobelFilmV3({audio=true}:{audio?:boolean}){const frame=useCurrentFrame(),state=stateAt(frame),cap=clips.find((c:any)=>frame>=c.start&&frame<c.end);if(state.scene==='references')return <><References state={state}/>{audio&&<Audio src={staticFile('nobel2026/master-v4.wav')}/>}</>;return <AbsoluteFill style={{background:'#f4f0e5',fontFamily:'"Microsoft YaHei",sans-serif',overflow:'hidden'}}><Stage state={state}/><AbsoluteFill style={{background:'linear-gradient(90deg,rgba(244,240,229,.72) 0%,rgba(244,240,229,.24) 39%,rgba(244,240,229,0) 76%)',pointerEvents:'none'}}/><Brand/><SceneTitle state={state}/><Scientists state={state}/><Evidence state={state}/><MechanismLegend state={state}/><Callout state={state}/>{cap&&<Caption clip={cap} text={cap.subtitle} progress={state.lineProgress}/>} {audio&&<Audio src={staticFile('nobel2026/master-v4.wav')}/>}</AbsoluteFill>;}
 129 | 
 130 | 
 131 | 

scripts/build_nobel2026_v3_timeline.py
   1 | from __future__ import annotations
   2 | 
   3 | """Build the V3 Nobel timeline from real narration durations.
   4 | 
   5 | The narration dictionary is the only source for displayed subtitles. Timing
   6 | is deliberately left pending here; the word-alignment pass measures it from
   7 | the current raw voice clips. Reusing V2 caption text or proportional timing
   8 | would silently put old wording on screen.
   9 | """
  10 | 
  11 | import json
  12 | import math
  13 | from pathlib import Path
  14 | 
  15 | import soundfile as sf
  16 | from align_nobel2026_v3 import sentence_parts
  17 | 
  18 | ROOT = Path(__file__).resolve().parents[1]
  19 | SRC = ROOT / "src/nobel2026"
  20 | # V3 must be built from the regenerated, unpadded clips.  Pointing at the V2
  21 | # directory silently reintroduced the old fixed-window timing and made the
  22 | # captions drift back toward the padded silence problem.
  23 | RAW = ROOT / "public/nobel2026/voice-v3-raw"
  24 | OUT = SRC / "timeline-v3.json"
  25 | BREATH = 0.22
  26 | CODA_SECONDS = 12.0
  27 | 
  28 | # Spoken language is kept natural and short enough for the rainbow鱼 voice.
  29 | # English names are shown as typographic lower thirds in the film; the Mandarin
  30 | # narration keeps the names pronounceable and consistent with the research text.
  31 | NARRATION = {
  32 |     "000": "我们的大脑每天都在发号施令。抬手、转头、眨眼，看起来只是一个动作。可在实验室里，真正难的是：这一次动作，到底是哪一群细胞发起的？如果只叫醒一小群细胞，问题才有机会问清楚。",
  33 |     # English laureate names stay on the lower third.  The spoken lines use
  34 |     # short, unambiguous Chinese phrasing so Qwen3-TTS does not turn names or
  35 |     # polyphonic technical words into distracting syllable errors.
  36 |     "001": "今年的诺贝尔生理学或医学奖，颁给三位科学家。他们的答案，都从一束光开始。",
  37 |     "002": "以前，只看到一片脑区亮起，只能说明它和行为同时发生。要证明因果，得只按下一类细胞的开关，再看行为会不会跟着改变。",
  38 |     "003": "这把开关没有先从人脑里找到。线索藏在一种会跟着光走的小绿藻身上。",
  39 |     "004": "把小绿藻放进透明容器，从左边照光，它就朝着光源游动。细胞上有一颗橙色感光点，收到光后，尾部两根细长鞭毛立刻改变节奏。",
  40 |     "005": "研究者用电极记录感光点附近的光电流。光到达后，大约半毫秒，电信号就出现了。人的眼睛走完类似过程，至少要十毫秒。为什么这种藻类这么快？",
  41 |     "006": "他提出一个大胆猜想：会不会有一种蛋白，既能感受光线，又能直接充当离子通道？难处在于，这种蛋白离开原来的细胞后，很容易失去活性。",
  42 |     "007": "转机来自基因测序。找到的基因被分别送进蛙卵，让蛙卵在细胞膜上做出这种蛋白。",
  43 |     "008": "蓝光一照，通道不到一毫秒就打开。带电粒子穿过细胞膜，细胞电压立刻变化。二零零三年，他们公布了这个结果。",
  44 |     "009": "他们还把这段基因放进两种培养细胞。原本不响应光的细胞，装上通道后，蓝光就能让它们发出电信号。",
  45 |     "010": "到这里，链条接上了：光照到蛋白，蛋白打开通道，离子流过，细胞发出电信号。下一个问题是，神经元能不能也这样控制？",
  46 |     "011": "一个研究团队一直在找这把开关。他们把感光基因送进透明培养容器里的鼠类神经细胞。",
  47 |     "012": "神经细胞一开始很安静。蓝光一闪，电信号就沿着神经往前走。光脉冲和电信号几乎同时出现。二零零五年，结果发表。",
  48 |     "013": "关键不只是让细胞亮起来，而是能按时间控制。光脉冲在千分之一秒内出现，电信号也几乎同时响应。研究者终于有了可重复、可定位的控制。",
  49 |     "014": "遗传学负责挑出哪一类细胞，光负责决定什么时候按下开关。二零零六年，这套方法有了名字：光遗传学。",
  50 |     "015": "一年后，一根细光纤穿过小鼠头骨，伸进运动皮层。研究者只给一类神经细胞装上通道，再用蓝光刺激它们，小鼠的胡须随之动起来。",
  51 |     "016": "同一年，研究者还把一类和清醒有关的细胞点亮，睡着的小鼠醒了过来。重点在于，光只碰到被标记的那一群细胞。",
  52 |     "017": "二零一二年，研究者先标记恐惧训练时活跃的细胞。几天后，只打开蓝光，小鼠就再次停住不动。这说明，这群细胞足以让那段记忆重新出现。",
  53 |     "018": "今天，这种方法已经被用来拆分疼痛、饥饿、奖赏、社交和注意力。混在一起的细胞，终于可以沿着一条条神经线路分开观察。",
  54 |     "019": "这项技术也在走向临床。失去感光细胞的患者，正在接受早期试验。研究者把光控通道送进视网膜，再用发光眼镜帮助辨认物体。目前仍然是探索中的治疗，需要基因递送和专用光源。",
  55 |     "020": "这一项诺贝尔奖打动人的地方，是把一个大问题拆成四个能验证的小问题：哪种细胞，哪种蛋白，哪一束光，产生了哪一个信号。",
  56 |     "021": "故事从这种藻类的感光点开始，经过一根光纤，最后让小鼠的胡须动了一下。这个故事，就是今年诺贝尔生理学或医学奖的核心。",
  57 | }
  58 | 
  59 | 
  60 | def main() -> None:
  61 |     old = json.loads((SRC / "timeline-v2.json").read_text(encoding="utf-8"))
  62 |     clips = []
  63 |     cursor = 0.0
  64 |     for source in old["clips"]:
  65 |         rid = source["id"]
  66 |         raw_seconds = sf.info(RAW / f"{rid}.wav").duration
  67 |         text = NARRATION[rid]
  68 |         parts = [{"text": part, "status": "pending"} for part in sentence_parts(text)]
  69 |         if "".join(part["text"] for part in parts) != text:
  70 |             raise ValueError(f"caption split changed narration text: {rid}")
  71 |         start_frame = round(cursor * 30)
  72 |         end_frame = round((cursor + raw_seconds + BREATH) * 30)
  73 |         clips.append({
  74 |             "id": rid,
  75 |             "scene": source["scene"],
  76 |             "start": start_frame,
  77 |             "end": end_frame,
  78 |             "subtitle": text,
  79 |             "spoken": text,
  80 |             "subtitleParts": parts,
  81 |             "asrSpeechEnd": None,
  82 |             "sourceDurationSeconds": round(raw_seconds, 3),
  83 |             "breathSeconds": BREATH,
  84 |         })
  85 |         cursor = end_frame / 30
  86 | 
  87 |     scenes = []
  88 |     for scene_name in [s["id"] for s in old["scenes"] if s["id"] != "references"]:
  89 |         rows = [c for c in clips if c["scene"] == scene_name]
  90 |         if not rows:
  91 |             continue
  92 |         scenes.append({"id": scene_name, "start": rows[0]["start"], "end": rows[-1]["end"], "title": scene_name})
  93 |     coda_start = round(cursor * 30)
  94 |     coda_end = coda_start + round(CODA_SECONDS * 30)
  95 |     scenes.append({"id": "references", "start": coda_start, "end": coda_end, "title": "证据与论文"})
  96 |     total = coda_end
  97 |     result = {
  98 |         "fps": 30,
  99 |         "duration": total,
 100 |         "seconds": round(total / 30, 3),
 101 |         "version": "v3-real-voice-timing",
 102 |         "voicePolicy": {"source": "public/nobel2026/voice-v3-raw", "maxBreathSeconds": BREATH, "noForcedTrim": True},
 103 |         "scenes": scenes,
 104 |         "clips": clips,
 105 |         "references": old["references"],
 106 |     }
 107 |     OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
 108 |     print(f"wrote {OUT} ({total} frames / {total / 30:.2f}s)")
 109 | 
 110 | 
 111 | if __name__ == "__main__":
 112 |     main()
 113 | 

LOCAL SCIENCE RECORD:
# 2026 年诺贝尔生理学或医学奖：检索与制作记录

## 官方事实（访问：2026-10-05）

- 官方获奖页：https://www.nobelprize.org/prizes/medicine/2026/
- 新闻稿：https://www.nobelprize.org/prizes/medicine/2026/press-release/
- 科普页：https://www.nobelprize.org/prizes/medicine/2026/popular-information/
- 科学背景：https://www.nobelprize.org/prizes/medicine/2026/advanced-information/
- 科普 PDF：https://www.nobelprize.org/uploads/2026/10/popular-medicineprize2026.pdf

获奖者：Karl Deisseroth、Peter Hegemann、Georg Nagel。获奖理由原文：
“for their discoveries concerning light-gated ion channels and optogenetics”。

视频中的科学链路按官方资料整理：衣藻趋光 → channelrhodopsin 光控阳离子通道 → 正离子流入并改变膜电位 → 神经元动作电位 → 光纤在活体小鼠脑内刺激特定细胞群。关键节点包括 2002/2003 年 channelrhodopsin、2005 年神经元实验、2007 年活体小鼠实验和 2006 年 optogenetics 命名。

临床边界：视网膜色素变性等方向属于早期探索和部分视觉恢复案例，视频没有写成完全治愈，也没有暗示普通蓝光可以直接控制人脑。

## 公开检索到的相关生物医学绘图工具

- BioRender：https://www.biorender.com/ —— 生物医学示意图与细胞/通路图的图形化工具，本片用作构图语言参考。
- UCSF ChimeraX：https://www.cgl.ucsf.edu/chimerax/ —— 分子结构可视化与分析工具，可用于通道蛋白结构的进一步镜头设计。
- Mol*： https://molstar.org/ —— 浏览器端分子结构可视化框架，可用于交互式结构浏览。
- Three.js：https://threejs.org/ —— 本片的细胞、膜通道、神经元、脑和光纤动态图形由此实现。
- Remotion：https://www.remotion.dev/ —— 本片的 1920×1080、30 fps 时间线、音画合成和渲染流程。

本片的医学图形为教学重构：Three.js 负责动态几何；官方 Nobel 插图用于来源卡与片尾引用；BioRender、ChimeraX、Mol* 作为医学可视化构图和后续分子结构扩展的工具参考，并非把重构画面冒充实验显微图。

## 官方图片署名

片中使用的 NobelPrize.org 科普插图署名：
© The Nobel Committee for Physiology or Medicine. Ill. Mattias Karlén

发布时保留片尾署名，并按官方页面的非商业使用说明核对具体授权范围。

## 关键论文线索

- Nagel et al. (2002), Channelrhodopsin-1
- Nagel et al. (2003), Channelrhodopsin-2
- Boyden et al. (2005), millisecond-timescale, genetically targeted optical control of neural activity
- Aravanis et al. (2007), temporally precise, cell-specific, spatially targeted optical control of neural activity in freely moving mammals

论文标题和年份只用于片尾索引，视频不把示意重构当成论文原图。

## 检索验证

2026-10-05 使用 `Invoke-WebRequest` 直接读取 NobelPrize.org 新闻稿页面，检查到获奖者三人姓名、授奖理由 `light-gated ion channels and optogenetics`，以及“Light-seeking algae gave us a switch for nerve cells”的官方叙述。BioRender、UCSF ChimeraX、Mol*、Three.js 官方主页均返回 HTTP 200；工具名称和用途按各自主页的公开说明记录。


OFFICIAL NOBEL POPULAR INFORMATION PDF (text extracted page-by-page from local official PDF; some figure captions may be absent):
PAGE 1
THE 2026 NOBEL PRIZE IN PHYSIOLOGY OR MEDICINE
POPULAR SCIENCE BACKGROUND
“For their discoveries concerning light-gated ion channels and optogenetics”
To understand how the brain forms memories, feelings and behaviours has long been a dream 
for researchers. Karl Deisseroth, Peter Hegemann and Georg Nagel are awarded the 2026 
Nobel Prize in Physiology or Medicine for discoveries leading to optogenetics, which makes 
it possible to switch on, or off, the activity of individual nerve cells in a living brain. This 
method is now being used in laboratories around the world to reveal the brain’s mysteries. 
Nobelpriset® är Nobelstiftelsens registrerade varumärke
A light-sensitive algal protein energised neuroscience
One of those who dreamed of more precise tools to explore the brain’s exceptionally complex 
network of nerve cells was Francis Crick (Nobel Prize 1962). A few decades after the ground­
breaking discovery of DNA’s double helix in 1953, he began investigating the mechanisms that 
underlie human consciousness. He envisioned ways to activate individual nerve cells in a living 
“My own brain is to me the most unaccountable of machinery — always buzzing, humming, soaring, 
roaring, diving, and then buried in mud. And why? What’s this passion for?”  
These are Virginia Woolf’s words in a letter to a friend in 1932. Many people share her fascina­
tion with the brain. How can this organ, which only weighs around 1.3 kilograms, hold child­
hood memories, daydreams and creativity? How can it be the cause of joy, love and jealousy? 
How does it control the pace of heartbeats, the rhythm of breathing and the sleep cycle? 
Since ancient times, researchers have attempted to understand this biological mystery. In the 
twentieth century, they successfully identified which regions of the brain govern various phy­
siological functions. This provided invaluable understanding, but the methods available at the 
time were relatively blunt and could not prove that a specific type of nerve cell directly caused 
a certain feeling or behaviour. The image of the brain that emerged was therefore like a blurry 
photograph, missing many details.
Figure 1. Scientists dreamed of using a switch for nerve cells.


PAGE 2
Chlamydomonas
~0.015 mm
Eye spot
Swims toward light
2(8)
THE 2026 NOBEL PRIZE IN PHYSIOLOGY OR MEDICINE
Chlamydomonas is famous for its ability to swim towards light. When researchers stir this green 
alga into a petri dish, the liquid turns a faint green colour. If they then illuminate one side 
of the dish, the green colour shifts towards the light source, as the microscopic algae swim 
towards it (Figure 2). The algae sense the light with an eyespot, a tiny orange dot on the cell’s 
surface that contains a light-capturing molecule, retinal. 
Hegemann investigates how a swimming alga senses light
Figure 2. The alga Chlamydomonas senses light using its eyespot. When light is sufficiently strong, it swims towards the source.
Hegemann investigated the algal eyespot. Using minuscule electrodes, he measured the electri­
cal signals that arose in Chlamydomonas when the eyespot was illuminated. The algae reacted 
incredibly quickly. Just half a millisecond after light reached the eyespot, an electrical impulse 
occurred.
brain. The signals in nerve cells are extremely rapid. To match this speed, he concluded that it 
would probably be ideal to use light. If molecular biologists could somehow manipulate nerve 
cells and get them to react to light, they might be able to control neural activity (Figure 1). Crick 
admitted that his idea sounded far-fetched, but perhaps not impossible to achieve. 
His vision of the future has now become reality. Karl Deisseroth, Peter Hegemann and Georg 
Nagel are awarded the 2026 Nobel Prize for their discovery of a molecular switch for nerve 
cells. Using light, researchers are now able to switch individual neural circuits on or off in the 
brain. They can bring memories to life, create feelings, drive behaviours and study the types 
of neurons that are involved in various psychiatric and neurological disorders. Optogenetics 
is fundamentally transforming our understanding of the brain. It has also provided important 
insights into how the nervous system interacts with various cells in other areas of the body, 
such as in the heart and gut. 
It all started with the curiosity of one researcher. In the early 1990s, Peter Hegemann at the Max 
Planck Institute for Biochemistry in Martinsried, asked a simple question: How can the unicel­
lular alga Chlamydomonas react so rapidly to light?


PAGE 3
3(8)
THE 2026 NOBEL PRIZE IN PHYSIOLOGY OR MEDICINE
Hegemann could only think of one explanation for this ultrafast response: the process must 
be much simpler in Chlamydomonas than in a human eye. In the early 1990s, he formulated the 
hypothesis that a single protein complex both captured light and acted as an ion channel. How­
ever, his proposal was met with scepticism. At the time, researchers knew of many different 
types of ion channels, but none of them could react to light on their own. 
To test his hypothesis, Hegemann attempted to isolate Chlamydomonas’s light-sensitive protein. 
However, this was easier said than done. When the proteins in the algal eyespot were removed 
from their natural setting, they became unstable and easily damaged, making them difficult to 
study. However, around the turn of the millennium, after years of setbacks, the research group 
made an intriguing finding. Japanese researchers had mapped the DNA of Chlamydomonas and 
made the genetic code for thousands of genes available. Among them, the Hegemann group 
found two genes that had significant similarities with known genes for light-capturing pro­
teins. Could either of these contain the code for the protein they were looking for? 
To answer this question, Hegemann contacted a colleague: Georg Nagel at the Max Planck 
Institute for Biophysics in Frankfurt. He had the necessary knowledge to take the next decisive 
step towards what would come to revolutionise neuroscience.
Nagel used egg cells from frogs to study proteins. When he received the two Chlamydomonas 
genes, he injected copies of them, separately, into different batches of frog eggs, which then 
began to mass produce the two unknown proteins (Figure 3). The proteins ended up on the 
surface of the egg cells, in the surrounding membrane. Nagel could then investigate how 
they functioned, and he quickly discovered that the hypothesis formulated by Hegemann a 
decade earlier was correct: the newly discovered proteins were ion channels that opened when 
exposed to light (Figure 3). 
These proteins were named channelrhodopsin-1 and channelrhodopsin-2. We will leave the first 
of these behind and concentrate on the second, which paved the way to optogenetics. 
The fast light reaction in algae ignites Hegemann’s curiosity
Hegemann and Nagel discover a remarkable protein 
Compared to other biological systems that researchers knew of at the time, this was remark­
ably fast. For example, light reaching a human eye triggers a complex chemical chain reaction 
that involves many different steps. The final protein in this chain — an ion channel — forms an 
opening in the cell surface through which charged ions can flow, creating an electrical signal. 
The entire process takes at least 10 milliseconds. So how could the response to light be more 
than twenty times faster in Chlamydomonas than in our own eyes?


PAGE 4
Egg cell
Closed
Ions
Ions
Electric signal
Light
Open
Chlamydomonas
gene copy
Frog
4(8)
THE 2026 NOBEL PRIZE IN PHYSIOLOGY OR MEDICINE
Figure 3. When Nagel and Hegemann introduced the Chlamydomonas genes in frog eggs, they began to produce ion channel 
proteins that ended up on the surface of the eggs. When the researchers illuminated the ion channels, they opened. Ions then 
flowed through the channels, creating an electric signal.
The algal protein activates human cells
Meeting psychiatric patients was decisive for Deisseroth
Just as in Hegemann’s experiment, Nagel’s characterisation of channelrhodopsin-2 showed that 
it reacted exceptionally strongly and rapidly to a pulse of light. A channel opened through the 
surface of the frog egg cell within 0.2 milliseconds. Positively charged ions then flowed through 
the channel, producing an electrical signal (Figure 3).  

Hegemann and Nagel realised that they had made a revolutionary discovery. They tested 
introducing the gene for channelrhodopsin-2 into embryonic human kidney cells and in kidney 
cells from hamsters. The cells became light-sensitive: when they were exposed to light they 
produced an electrical signal. 
In 2003, Hegemann and Nagel published the results of their experiment. They proposed that 
channelrhodopsin-2 could be used as a powerful tool to generate electrical impulses in cells 
using light. After this, a young scientist at Stanford University took the baton.
In the 1990s, when Karl Deisseroth started to study medicine, he was considering becoming a 
neurosurgeon, but part of his training was done at a psychiatric clinic. There, he was struck by 
the patients’ suffering and their need for help. At the same time, he began to wonder how the 
brain can work so differently in different people. Why do people with depression find it so dif­
ficult to feel joy? What causes autism, or schizophrenic delusions?  
In parallel with his medical studies, he gained a PhD in neuroscience. In the laboratory, he used 
thin brain slices and examined them in petri dishes. His research yielded important insights, 
but he realised that in order to understand the diseases he encountered in the clinic, he needed 
to study how nerve cells function in a living brain. 


PAGE 5
Ions
Nerve
signal
Nerve cells
Channelrhodopsin-2
gene copy
Light
Light
5(8)
THE 2026 NOBEL PRIZE IN PHYSIOLOGY OR MEDICINE
Figure 4. Deisseroth introduced the gene encoding channelrhodopsin-2 into nerve cells that he cultured in a petri dish, making 
the nerve cells sensitive to light. Using blue light, the rearchers were able to trigger a rapid nerve signal.
Success! Moving algal protein into nerve cells
Optogenetic control of nerve cells in a living brain
Other researchers were trying to develop methods that made it possible to control the activity 
of specific nerve cells in the manner proposed by Francis Crick. However, many of them were 
concerned about wasting time and money on something that appeared to be an unrealistic 
dream. Deisseroth realised that he had to take the risk of failing; the treatments he was able to 
offer his patients were rarely effective and often produced debilitating side-effects. If he were to 
find a better way of helping them, he needed a more profound understanding of the brain. 
When Deisseroth started his own research group, they began to search for a protein they could 
use to trigger electrical impulses in nerve cells. They tested numerous candidates and when 
Deisseroth heard about the discovery of channelrhodopsin-2, he wrote to Georg Nagel and 
asked whether he could have access to the DNA encoding the protein. 
When the DNA arrived in Deisseroth’s lab, he introduced it into rat nerve cells cultured in petri 
dishes. He worried that the sensitive nerve cells would be negatively affected by the foreign 
gene, but they began to produce channelrhodopsin-2 with no apparent problems. When the 
research group exposed the nerve cells to blue light, the cells reacted immediately. The light 
provoked a nerve signal that could be propagated to other nerve cells.
In 2005, Deisseroth’s research group published their discovery. They had achieved a decisive 
milestone, although Deisseroth understood that he had a long journey before reaching his goal: 
the ability to control the activity of nerve cells in live animals. 
Karl Deisseroth now began numerous collaborations, including with Peter Hegemann and 
Georg Nagel. He also shared his discovery with other researchers who understood its enor­
mous potential. With Deisseroth’s lab at the forefront, researchers soon found more proteins 
that can turn nerve cells on and off, and which are activated by different wavelengths of light. 


PAGE 6
Optical fiber
Nerve 
signal
Channelrhodopsin-2
gene copy
6(8)
THE 2026 NOBEL PRIZE IN PHYSIOLOGY OR MEDICINE
In 2006, this new method was given the name optogenetics. One year later, Deisseroth success­
fully activated nerve cells in the brains of living mice (Figure 5). His research group introduced 
the gene for channelrhodopsin-2 into a specific nerve cell type in the motor cortex, the area of 
the brain that governs movement. They then illuminated the nerve cells with a thin optic fibre 
that they fed into the brain through a small hole in the skull. This allowed them to control 
movements of the mouse whiskers. 
Figure 5. Deisseroth’s research group delivered the gene for channelrhodopsin-2 to the brains of living mice. They then inserted 
a thin optical fiber into the brain. When they illuminated the nerve cells through the optical fiber, a nerve signal was triggered 
that induced movement of the whiskers.
The same year, working with other researchers, Deisseroth used optogenetics to wake sleeping 
mice in a controlled manner. The research group introduced channelrhodopsin-2 into a recently 
discovered type of nerve cell that they suspected controlled wakefulness. When they shone 
light on the nerve cells, the mice woke up, confirming the hypothesis.
Another famous piece of work from the infancy of optogenetics was published in 2012. 
Together with Susumu Tonegawa (the 1987 Nobel Prize for discoveries in immunology), Deis­
seroth successfully activated an engram‚ the specific pattern of neural pathways that is formed 
when a memory is created. The researchers studied the brains of mice as they experienced 
fear, and noted which nerve cells appeared to form the memory of the experience. When they 
later reactivated these nerve cells, the mice showed signs of fear, despite not being in danger at 
the time. This was the first experiment in which researchers could demonstrate exactly which 
nerve cells are necessary for a specific memory. 
The ability to activate individual types of nerve cells in the brain has fundamentally changed 
our understanding of this incredible organ. An adult human brain has around 90 billion nerve 
cells, each of which forms thousands of connections with other nerve cells. In many cases, the 
pathway from a nerve cell stretches to a completely different area of the brain, while nerve cells 
that govern entirely separate physical functions can be closely intermingled.
A new epoch in neuroscience


PAGE 7
7(8)
THE 2026 NOBEL PRIZE IN PHYSIOLOGY OR MEDICINE
Hope for new medical treatments 
Optogenetics: a transformative method in neuroscience
Thanks to optogenetics, researchers can now discover exactly which of the nerve cells in a 
complicated bundle control different brain functions. For example, they have identified neural 
circuits that govern the sense of pain, social behaviours, thirst, food consumption, reward and 
attention. They have also found nerve cells responsible for diverse functions, from controlling 
the circadian rhythm to causing a fever when the immune system is activated. 
When researchers studied more complex behaviours, such as how mice care for their young, 
they discovered that the various components of a behaviour can be controlled by separate 
neural circuits. One circuit governs, for example, how mice gather their young in a nest, 
another regulates the way that they groom them. 
Optogenetics can also be used to map the nervous system and cell functions outside the brain. 
Deisseroth has demonstrated that heart rhythm can affect our emotions; if the heart is forced 
to work harder, this can reinforce feelings of anxiety. Other researchers have identified specific 
cells in the gut that can explain why some people would rather eat sugar than sweeteners, to 
give just a few of very many examples. 
The hope that the knowledge generated by using optogenetics will lead to new medical treat­
ments has begun to come to fruition. The method has provided greater understanding of the 
distinguishing features of psychiatric and neurological disorders such as depression, anxiety, 
schizophrenia, Alzheimer’s disease and Parkinson’s disease. 
Researchers have also taken the first steps towards using optogenetics as a medical treatment. 
In ongoing clinical trials they attempt to restore vision in people who have become blind due 
to retinitis pigmentosa, a disease that destroys the eye’s rods and cones. When they inserted a 
channelrhodopsin-like protein in the retina of a blind person, the person regained some vision. 
Using special glasses emitting light, the person was able to discern and grasp objects on a table. 
There are also hopes that optogenetics could improve cochlea implants. Currently, these 
implants stimulate the auditory nerve using electricity. If it were instead possible to use optoge­
netics, the implant may be able to activate the auditory nerve with greater precision. 
Karl Deisseroth, Peter Hegemann and Georg Nagel are awarded the 2026 Nobel Prize in 
Physiology or Medicine for their discoveries that led to an incredibly powerful tool that has 
transformed neuroscience. Optogenetics continues to unravel one of humanity’s greatest 
mysteries: how the brain works.


PAGE 8
8(8)
THE 2026 NOBEL PRIZE IN PHYSIOLOGY OR MEDICINE
KARL DEISSEROTH
PETER HEGEMANN 
GEORG NAGEL
Born 1971. Ph.D. 1998 and MD 
2000 from Stanford University, 
USA. D.H. Chen Professor, 
Professor of Bioengineering and 
of Psychiatry and Behavioral 
Sciences, at the Howard Hughes 
Medical Institute and Stanford 
University, USA.
Born 1954. Ph.D 1984 at the Max 
Planck Institute for Biochemistry, 
Martinsried, Germany. Hertie 
Senior Professor of Neuroscience, 
Humboldt University of Berlin, 
Germany. The prize awarded 
discoveries were made at the Max 
Planck Institute for Biochemistry, 
Martinsried, Germany
Born 1953. Ph.D. 1988 at the 
University of Frankfurt, Germany. 
Professor of Molecular Plant 
Physiology at the Department for 
Molecular Plant Physiology and 
Biophysics - Botany I, University 
of Würzburg, Germany. The 
prize awarded discoveries were 
made at Max Planck Institute for 
Biophysics, Frankfurt, Germany.
Science editors: Abdel El Manira, Sten Linnarsson, Thomas Perlmann, Per Svenningsson and 
Anna Wedell, the Nobel Committee for Physiology or Medicine
Text: Ann Fernholm
Translation: Clare Barnes
Illustrations: Mattias Karlén
© The Nobel Assembly at Karolinska Institutet
The 2026 Nobel Prize in Physiology or Medicine
Key Publications
Harz, H., Nonnengasser, C., Hegemann, P. The photoreceptor current of the green alga 
Chlamydomonas. Philos. Trans. R. Soc. Lond. Ser. B: Biol. Sci. 1992:338:39–52. 
Nagel G, Ollig D, Fuhrmann M, Kateriya S, Musti AM, Bamberg E, Hegemann P. 
Channelrhodopsin-1: a light-gated proton channel in green algae. Science. 2002:296:2395–2398.
Nagel G, Szellas T, Huhn W, Kateriya S, Adeishvili N, Berthold P, Ollig D, Hegemann P, 
Bamberg E. Channelrhodopsin-2, a directly light-gated cation selective membrane channel. 
Proc. Natl. Acad. Sci. U. S. A. 2003:100:13940–13945.
Boyden ES, Zhang F, Bamberg E, Nagel G, Deisseroth K. Millisecond-timescale, genetically 
targeted optical control of neural activity. Nat. Neurosci. 2005:8:1263–1268.
Aravanis AM, Wang LP, Zhang F, Meltzer LA, Mogri MZ, Schneider MB, Deisseroth K. An 
optical neural interface: in vivo control of rodent motor cortex with integrated fiberoptic and 
optogenetic technology. J Neural Eng. 2007:4:S143–156.
“For their discoveries concerning light-gated ion channels and optogenetics”

