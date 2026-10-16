// src/visual.ts
import * as T from "three";
var C = { paper: "#f2eee7", ink: "#29484a", teal: "#367f83", aqua: "#8cbdba", red: "#b44f48", rose: "#d49389", pale: "#eac6b5", gold: "#c9a151", bone: "#eee5d6" };
var clamp = (x) => Math.max(0, Math.min(1, x));
var smooth = (x) => {
  const u = clamp(x);
  return u * u * u * (u * (u * 6 - 15) + 10);
};

// src/Scale.ts
var SCALE = {
  isletRadius: 75e-6,
  betaRadius: 75e-7,
  betaUnit: 75e-7 / 1.25,
  epithelialUnit: 25e-6,
  receptorUnit: 1e-10 / 0.0165,
  neuronUnit: 1e-4
};
var TYPOGRAPHY = { family: '"Rainbow Sans", sans-serif', title: 72, body: 46, label: 36, weight: 500, strong: 650 };

// src/timeline.json
var timeline_default = {
  fps: 30,
  duration: 9776,
  durationFrames: 9776,
  durationSeconds: 325.8666666666667,
  clips: [
    {
      id: "g001",
      section: "news",
      text: "\u4ECA\u5E74\u8BFA\u5956\u5F00\u5956\u524D\uFF0C\u6CD5\u65B0\u793E\u62A5\u9053\uFF0C\u51CF\u80A5\u836F\u80CC\u540E\u7684\u80A0\u9053\u4FE1\u53F7\u7814\u7A76\uFF0C\u662F\u533B\u5B66\u5956\u70ED\u95E8\u3002",
      caption: "\u4ECA\u5E74\u8BFA\u5956\u5F00\u5956\u524D\uFF0C\u6CD5\u65B0\u793E\u62A5\u9053\uFF0C\u51CF\u80A5\u836F\u80CC\u540E\u7684\u80A0\u9053\u4FE1\u53F7\u7814\u7A76\uFF0C\u662F\u533B\u5B66\u5956\u70ED\u95E8\u3002",
      focus: "\u9910\u684C\u4FEF\u659C\u8FD1\u666F\uFF1B\u5DE6\u4FA7\u53E0AFP\u771F\u5B9E\u65B0\u95FBheadline/date/source\uFF0C\u4E0D\u51FA\u73B0\u9881\u5956\u5927\u5385\u6216\u5B98\u65B9\u63D0\u540D\u65AD\u8A00\u3002",
      sourceIds: [
        "afp2026"
      ],
      start: 12,
      end: 234,
      duration: 222,
      startSeconds: 0.4,
      endSeconds: 7.8,
      voiceEndSeconds: 7.600041666666667,
      voiceDurationSeconds: 7.2000416666666665,
      audioSHA256: "ff132092dc0e8fc1ca0be22c7afc8d38c153cfcc0c90e83800e102ca5605ac5d",
      audio: "voice/g001.wav"
    },
    {
      id: "g002",
      section: "news",
      text: "\u5B83\u53EB\u80F0\u9AD8\u8840\u7CD6\u7D20\u6837\u80BD\u4E00\u3002\u4ECA\u5E74\u867D\u672A\u83B7\u5956\uFF0C\u5374\u5DF2\u8BA9\u6211\u4EEC\u91CD\u65B0\u7406\u89E3\u98DF\u6B32\u3002",
      caption: "\u5B83\u53EB\u80F0\u9AD8\u8840\u7CD6\u7D20\u6837\u80BD-1\uFF08GLP-1\uFF09\u3002\u4ECA\u5E74\u867D\u672A\u83B7\u5956\uFF0C\u5374\u5DF2\u8BA9\u6211\u4EEC\u91CD\u65B0\u7406\u89E3\u98DF\u6B32\u3002",
      focus: "\u4FDD\u6301\u9910\u684C\u4FEF\u659C\u8FD1\u666F\uFF1BGLP-1\u540D\u79F0\u4E0E\u65B0\u95FB\u8FDE\u8D2F\u5448\u73B0\uFF1B\u4EC5\u6B64\u4E00\u53E5\u63D0\u53CA2026\u672A\u83B7\u5956\u3002",
      sourceIds: [
        "afp2026",
        "nobel2026",
        "lasker2024"
      ],
      start: 234,
      end: 412,
      duration: 178,
      startSeconds: 7.8,
      endSeconds: 13.733333333333333,
      voiceEndSeconds: 13.559999999999999,
      voiceDurationSeconds: 5.76,
      audioSHA256: "3e29e30f8da11a62c7a0432369d97607f13961988f9d611fda7fa2aa78473805",
      audio: "voice/g002.wav"
    },
    {
      id: "g003",
      section: "meal",
      text: "\u4E3A\u4EC0\u4E48\u4E00\u6761\u80A0\u9053\u4FE1\u53F7\uFF0C\u80FD\u5F15\u8D77\u8FD9\u4E48\u5927\u7684\u5173\u6CE8\uFF1F\u5148\u770B\u4E00\u987F\u666E\u901A\u7684\u665A\u996D\u3002",
      caption: "\u4E3A\u4EC0\u4E48\u4E00\u6761\u80A0\u9053\u4FE1\u53F7\uFF0C\u80FD\u5F15\u8D77\u8FD9\u4E48\u5927\u7684\u5173\u6CE8\uFF1F\u5148\u770B\u4E00\u987F\u666E\u901A\u7684\u665A\u996D\u3002",
      focus: "\u955C\u5934\u79FB\u5411\u996D\u83DC\uFF0C\u65B0\u95FB\u6587\u5B57\u9000\u51FA\uFF1B\u4ECE\u65B0\u95FB\u7591\u95EE\u843D\u5230\u65E5\u5E38\u665A\u996D\u3002",
      sourceIds: [],
      start: 412,
      end: 576,
      duration: 164,
      startSeconds: 13.733333333333333,
      endSeconds: 19.2,
      voiceEndSeconds: 19.013333333333332,
      voiceDurationSeconds: 5.28,
      audioSHA256: "960632fcc53602bf219686eb6e627dea0ffa6eb59c9c6e5451126f9c2d2b1a6f",
      audio: "voice/g003.wav"
    },
    {
      id: "g004",
      section: "meal",
      text: "\u660E\u660E\u5DF2\u7ECF\u5403\u9971\uFF0C\u770B\u5230\u751C\u70B9\u8FD8\u662F\u60F3\u6765\u4E00\u53E3\u3002\u809A\u5B50\u88C5\u6EE1\uFF0C\u4E3A\u4EC0\u4E48\u5634\u8FD8\u60F3\u5403\uFF1F",
      caption: "\u660E\u660E\u5DF2\u7ECF\u5403\u9971\uFF0C\u770B\u5230\u751C\u70B9\u8FD8\u662F\u60F3\u6765\u4E00\u53E3\u3002\u809A\u5B50\u88C5\u6EE1\uFF0C\u4E3A\u4EC0\u4E48\u5634\u8FD8\u60F3\u5403\uFF1F",
      focus: "\u955C\u5934\u63A0\u8FC7\u70B9\u5FC3\uFF1B\u660E\u660E\u5403\u9971\u4ECD\u60F3\u5C1D\u751C\u70B9\uFF0C\u4E0D\u8981\u6C42\u4EBA\u7269\u4F38\u624B\u6216\u62FF\u53D6\u3002",
      sourceIds: [
        "mechanisms2018"
      ],
      start: 576,
      end: 759,
      duration: 183,
      startSeconds: 19.2,
      endSeconds: 25.3,
      voiceEndSeconds: 25.119999999999997,
      voiceDurationSeconds: 5.92,
      audioSHA256: "f40eed4cade0bb776a63b9d86a7226a6c850d20f19c795d90772ca6208a7f9fa",
      audio: "voice/g004.wav"
    },
    {
      id: "g005",
      section: "meal",
      text: "\u539F\u6765\uFF0C\u4E00\u987F\u996D\u5E26\u6765\u7684\u4E0D\u53EA\u662F\u80C3\u91CC\u7684\u98DF\u7269\uFF0C\u8FD8\u6709\u5668\u5B98\u4E4B\u95F4\u63A5\u8FDE\u4F20\u9012\u7684\u6D88\u606F\u3002",
      caption: "\u539F\u6765\uFF0C\u4E00\u987F\u996D\u5E26\u6765\u7684\u4E0D\u53EA\u662F\u80C3\u91CC\u7684\u98DF\u7269\uFF0C\u8FD8\u6709\u5668\u5B98\u4E4B\u95F4\u63A5\u8FDE\u4F20\u9012\u7684\u6D88\u606F\u3002",
      focus: "\u955C\u5934\u56DE\u5230\u7C73\u996D\uFF1B\u7528\u5FAE\u5F31\u4FE1\u53F7\u5149\u70B9\u6697\u793A\u5668\u5B98\u901A\u4FE1\uFF0C\u4E0D\u8981\u6C42\u653E\u7B77\u52A8\u4F5C\u3002",
      sourceIds: [
        "native_half_life",
        "mechanisms2018"
      ],
      start: 759,
      end: 942,
      duration: 183,
      startSeconds: 25.3,
      endSeconds: 31.4,
      voiceEndSeconds: 31.22,
      voiceDurationSeconds: 5.92,
      audioSHA256: "dfb969c772b9ad20c5ed0438e9c7914293e2942fd08c9959e58eb1f50ebe97f0",
      audio: "voice/g005.wav"
    },
    {
      id: "g006",
      section: "meal",
      text: "\u73B0\u5728\u8DDF\u7740\u8FD9\u53E3\u996D\u8D70\uFF0C\u53BB\u770B\u770B\u8FD9\u6761\u4FE1\u53F7\uFF0C\u600E\u6837\u5F71\u54CD\u8840\u7CD6\uFF0C\u53C8\u600E\u6837\u5F71\u54CD\u98DF\u6B32\u3002",
      caption: "\u73B0\u5728\u8DDF\u7740\u8FD9\u53E3\u996D\u8D70\uFF0C\u53BB\u770B\u770B\u8FD9\u6761\u4FE1\u53F7\uFF0C\u600E\u6837\u5F71\u54CD\u8840\u7CD6\uFF0C\u53C8\u600E\u6837\u5F71\u54CD\u98DF\u6B32\u3002",
      focus: "\u955C\u5934\u62AC\u5347\u8FDB\u5165\u4EBA\u4F53\uFF0C\u6CBF\u98DF\u7269\u6D41\u542F\u52A8\u8EAB\u4F53\u63A2\u7D22\u3002",
      sourceIds: [
        "native_half_life",
        "mechanisms2018"
      ],
      start: 942,
      end: 1120,
      duration: 178,
      startSeconds: 31.4,
      endSeconds: 37.333333333333336,
      voiceEndSeconds: 37.16,
      voiceDurationSeconds: 5.76,
      audioSHA256: "d35c99262ceaf87a7d430d0ce898fd48ff8d0458a7651454177efbabec5fb3e1",
      audio: "voice/g006.wav"
    },
    {
      id: "g007",
      section: "gut",
      text: "\u98DF\u7269\u5148\u7ECF\u8FC7\u80C3\uFF0C\u518D\u8FDB\u5165\u80A0\u9053\u3002\u8425\u517B\u5230\u6765\uFF0C\u80A0\u58C1\u91CC\u7684\u7279\u6B8A\u7EC6\u80DE\u5C31\u6709\u4E86\u53CD\u5E94\u3002",
      caption: "\u98DF\u7269\u5148\u7ECF\u8FC7\u80C3\uFF0C\u518D\u8FDB\u5165\u80A0\u9053\u3002\u8425\u517B\u5230\u6765\uFF0C\u80A0\u58C1\u91CC\u7684\u7279\u6B8A\u7EC6\u80DE\u5C31\u6709\u4E86\u53CD\u5E94\u3002",
      focus: "\u98DF\u7269\u7ECF\u80C3\u8FDB\u5165\u80A0\u9053\uFF1B\u8425\u517B\u63A5\u8FD1\u4E0A\u76AE\uFF0C\u7279\u6B8A\u5185\u5206\u6CCC\u7EC6\u80DE\u5F00\u59CB\u54CD\u5E94\u3002",
      sourceIds: [
        "native_half_life"
      ],
      start: 1120,
      end: 1320,
      duration: 200,
      startSeconds: 37.333333333333336,
      endSeconds: 44,
      voiceEndSeconds: 43.81333333333333,
      voiceDurationSeconds: 6.48,
      audioSHA256: "5f980a7179530904b9f4e78da15f09f7ae8cbd610b8ca75af8b564f82666012c",
      audio: "voice/g007.wav"
    },
    {
      id: "g008",
      section: "gut",
      text: "\u5B83\u4EEC\u50CF\u6CBF\u8DEF\u7684\u54E8\u5175\uFF0C\u611F\u77E5\u8FDB\u98DF\u5E26\u6765\u7684\u53D8\u5316\uFF0C\u518D\u4ECE\u671D\u5411\u8EAB\u4F53\u5185\u90E8\u7684\u4E00\u4FA7\uFF0C\u91CA\u653E\u4FE1\u53F7\u3002",
      caption: "\u5B83\u4EEC\u50CF\u6CBF\u8DEF\u7684\u54E8\u5175\uFF0C\u611F\u77E5\u8FDB\u98DF\u5E26\u6765\u7684\u53D8\u5316\uFF0C\u518D\u4ECE\u671D\u5411\u8EAB\u4F53\u5185\u90E8\u7684\u4E00\u4FA7\uFF0C\u91CA\u653E\u4FE1\u53F7\u3002",
      focus: "\u80A0\u8154\u5728\u4E0A/\u5916\u4FA7\uFF0C\u8840\u7BA1\u5728\u57FA\u5E95\u4FA7\uFF1BL\u7EC6\u80DE\u91CA\u653E\u5C0F\u80BD\u671D\u8EAB\u4F53\u5185\u90E8\uFF0C\u4E0D\u80FD\u5411\u80A0\u8154\u55B7\u5C04\u3002",
      sourceIds: [
        "native_half_life"
      ],
      start: 1320,
      end: 1529,
      duration: 209,
      startSeconds: 44,
      endSeconds: 50.96666666666667,
      voiceEndSeconds: 50.8,
      voiceDurationSeconds: 6.8,
      audioSHA256: "3dc87765aa2511fa51baa48bbb42625ab256db21aa74c94097bc41a8cad92423",
      audio: "voice/g008.wav"
    },
    {
      id: "g009",
      section: "gut",
      text: "\u8FD9\u79CD\u4FE1\u53F7\u8FDB\u5165\u5468\u56F4\u7EC4\u7EC7\u548C\u8840\u6DB2\uFF0C\u544A\u8BC9\u8EAB\u4F53\uFF1A\u996D\u5230\u4E86\uFF0C\u8BE5\u51C6\u5907\u63A5\u6536\u8425\u517B\u4E86\u3002",
      caption: "\u8FD9\u79CD\u4FE1\u53F7\u8FDB\u5165\u5468\u56F4\u7EC4\u7EC7\u548C\u8840\u6DB2\uFF0C\u544A\u8BC9\u8EAB\u4F53\uFF1A\u996D\u5230\u4E86\uFF0C\u8BE5\u51C6\u5907\u63A5\u6536\u8425\u517B\u4E86\u3002",
      focus: "L\u7EC6\u80DE\u9644\u8FD1\u7EC4\u7EC7\u4E0E\u6BDB\u7EC6\u8840\u7BA1\u4F20\u9012\u4FE1\u53F7\uFF0C\u98DF\u7269\u9897\u7C92\u4E0D\u8FDB\u5165\u8840\u7BA1\u3002",
      sourceIds: [
        "native_half_life",
        "mechanisms2018"
      ],
      start: 1529,
      end: 1717,
      duration: 188,
      startSeconds: 50.96666666666667,
      endSeconds: 57.233333333333334,
      voiceEndSeconds: 57.04666666666667,
      voiceDurationSeconds: 6.08,
      audioSHA256: "03d0765cb3fa8ba5aee0c9253a31d50dc8bb02462451295341df905b7ee63afe",
      audio: "voice/g009.wav"
    },
    {
      id: "g010",
      section: "gut",
      text: "\u79D1\u5B66\u5BB6\u65E9\u5C31\u53D1\u73B0\uFF0C\u8840\u7CD6\u5347\u5230\u76F8\u8FD1\u6C34\u5E73\u65F6\uFF0C\u559D\u4E0B\u7CD6\u6C34\uFF0C\u6BD4\u4ECE\u9759\u8109\u8F93\u7CD6\u66F4\u80FD\u4FC3\u8FDB\u80F0\u5C9B\u7D20\u91CA\u653E\u3002",
      caption: "\u79D1\u5B66\u5BB6\u65E9\u5C31\u53D1\u73B0\uFF0C\u8840\u7CD6\u5347\u5230\u76F8\u8FD1\u6C34\u5E73\u65F6\uFF0C\u559D\u4E0B\u7CD6\u6C34\uFF0C\u6BD4\u4ECE\u9759\u8109\u8F93\u7CD6\u66F4\u80FD\u4FC3\u8FDB\u80F0\u5C9B\u7D20\u91CA\u653E\u3002",
      focus: "\u76F8\u8FD1\u8840\u7CD6\u6C34\u5E73\u7684\u53E3\u670D/\u9759\u8109\u8461\u8404\u7CD6\u6BD4\u8F83\uFF1B\u53E3\u670D\u80F0\u5C9B\u7D20\u54CD\u5E94\u66F4\u5F3A\uFF0C\u4E0D\u753B\u6210\u76F8\u540C\u5242\u91CF\u5373\u53EF\u4FDD\u8BC1\u7B49\u8840\u7CD6\u3002",
      sourceIds: [
        "lasker2024"
      ],
      start: 1717,
      end: 1950,
      duration: 233,
      startSeconds: 57.233333333333334,
      endSeconds: 65,
      voiceEndSeconds: 64.83333333333333,
      voiceDurationSeconds: 7.6,
      audioSHA256: "bd3b4bc3f400f3437d004d4c5ee1a5b9b402b7abad5882e3a31220f0f93ea70f",
      audio: "voice/g010.wav"
    },
    {
      id: "g011",
      section: "gut",
      text: "\u539F\u6765\uFF0C\u98DF\u7269\u7ECF\u8FC7\u80A0\u9053\u65F6\uFF0C\u591A\u53D1\u51FA\u4E86\u4E00\u6761\u6D88\u606F\uFF0C\u63D0\u524D\u7ED9\u80F0\u817A\u6253\u4E86\u62DB\u547C\u3002",
      caption: "\u539F\u6765\uFF0C\u98DF\u7269\u7ECF\u8FC7\u80A0\u9053\u65F6\uFF0C\u591A\u53D1\u51FA\u4E86\u4E00\u6761\u6D88\u606F\uFF0C\u63D0\u524D\u7ED9\u80F0\u817A\u6253\u4E86\u62DB\u547C\u3002",
      focus: "\u80A0\u9053\u5411\u80F0\u817A\u7684\u4FE1\u53F7\u8DEF\u5F84\uFF1B\u80A0\u4FC3\u80F0\u7D20\u5305\u62ECGLP-1\u53CAGIP\uFF0C\u907F\u514D\u8BF4\u53EA\u5B58\u5728\u8FD9\u4E00\u79CD\u4FE1\u53F7\u3002",
      sourceIds: [
        "lasker2024",
        "mechanisms2018"
      ],
      start: 1950,
      end: 2126,
      duration: 176,
      startSeconds: 65,
      endSeconds: 70.86666666666666,
      voiceEndSeconds: 70.68,
      voiceDurationSeconds: 5.68,
      audioSHA256: "17e7297a1005ae305aaf7ab4c47244601bffe722b1e92572c74531d78266753e",
      audio: "voice/g011.wav"
    },
    {
      id: "g012",
      section: "pancreas",
      text: "\u6765\u5230\u80F0\u817A\uFF0C\u91CC\u9762\u6709\u4E00\u7FA4\u8D1F\u8D23\u91CA\u653E\u80F0\u5C9B\u7D20\u7684\u7EC6\u80DE\uFF0C\u8868\u9762\u957F\u7740\u63A5\u6536\u4FE1\u53F7\u7684\u53D7\u4F53\u3002",
      caption: "\u6765\u5230\u80F0\u817A\uFF0C\u91CC\u9762\u6709\u4E00\u7FA4\u8D1F\u8D23\u91CA\u653E\u80F0\u5C9B\u7D20\u7684\u7EC6\u80DE\uFF0C\u8868\u9762\u957F\u7740\u63A5\u6536\u4FE1\u53F7\u7684\u53D7\u4F53\u3002",
      focus: "\u80F0\u817A\u2014\u80F0\u5C9B\u2014\u03B2\u7EC6\u80DE\u9010\u7EA7\u653E\u5927\uFF1B\u7EC6\u80DE\u819C\u53D7\u4F53\u662F\u63A5\u6536\u4FE1\u53F7\u7684\u7ED3\u6784\u3002",
      sourceIds: [
        "native_half_life",
        "receptor2017"
      ],
      start: 2126,
      end: 2326,
      duration: 200,
      startSeconds: 70.86666666666666,
      endSeconds: 77.53333333333333,
      voiceEndSeconds: 77.34666666666666,
      voiceDurationSeconds: 6.48,
      audioSHA256: "26a813080132e4ee6b7a7151063c1bed4e738301f8df0140129ddb40cbbca286",
      audio: "voice/g012.wav"
    },
    {
      id: "g013",
      section: "pancreas",
      text: "\u5C31\u50CF\u94A5\u5319\u9047\u5230\u5408\u9002\u7684\u9501\uFF0C\u5C0F\u80BD\u7ED3\u5408\u53D7\u4F53\uFF0C\u53D7\u4F53\u6539\u53D8\u5F62\u72B6\uFF0C\u628A\u6D88\u606F\u4F20\u8FDB\u7EC6\u80DE\u3002",
      caption: "\u5C31\u50CF\u94A5\u5319\u9047\u5230\u5408\u9002\u7684\u9501\uFF0C\u5C0F\u80BD\u7ED3\u5408\u53D7\u4F53\uFF0C\u53D7\u4F53\u6539\u53D8\u5F62\u72B6\uFF0C\u628A\u6D88\u606F\u4F20\u8FDB\u7EC6\u80DE\u3002",
      focus: "GLP-1\u7ED3\u5408GLP-1R\u5E76\u6539\u53D8\u6784\u8C61\uFF1B\u94A5\u5319\u9501\u662F\u529F\u80FD\u6BD4\u55BB\uFF0C\u52A8\u6001\u4E3A\u6559\u5B66\u793A\u610F\uFF0C\u53C2\u8003PDB 5VAI\u3002",
      sourceIds: [
        "receptor2017",
        "pdb5vai"
      ],
      start: 2326,
      end: 2535,
      duration: 209,
      startSeconds: 77.53333333333333,
      endSeconds: 84.5,
      voiceEndSeconds: 84.33333333333333,
      voiceDurationSeconds: 6.8,
      audioSHA256: "82fa1a9bf750864f38bef3ce4aee7ec7344743bf3b88e995af132ff8e11f6962",
      audio: "voice/g013.wav"
    },
    {
      id: "g014",
      section: "pancreas",
      text: "\u4E00\u4E5D\u516B\u4E03\u5E74\uFF0C\u7814\u7A76\u8005\u628A\u4E0D\u540C\u957F\u5EA6\u7684\u5C0F\u80BD\uFF0C\u5206\u522B\u9001\u8FDB\u79BB\u4F53\u5927\u9F20\u80F0\u817A\uFF0C\u770B\u770B\u8C01\u80FD\u8D77\u6548\u3002",
      caption: "\u4E00\u4E5D\u516B\u4E03\u5E74\uFF0C\u7814\u7A76\u8005\u628A\u4E0D\u540C\u957F\u5EA6\u7684\u5C0F\u80BD\uFF0C\u5206\u522B\u9001\u8FDB\u79BB\u4F53\u5927\u9F20\u80F0\u817A\uFF0C\u770B\u770B\u8C01\u80FD\u8D77\u6548\u3002",
      focus: "1987 Mojsov\u7B49\u539F\u59CB\u8BBA\u6587\u4E0E\u79BB\u4F53\u704C\u6D41\u5927\u9F20\u80F0\u817A\uFF1B\u6BD4\u8F83\u4E0D\u540C\u957F\u5EA6\u80BD\uFF0C\u4E0D\u753B\u6210\u4EBA\u4F53\u51CF\u80A5\u5B9E\u9A8C\u3002",
      sourceIds: [
        "mojsov1987",
        "lasker2024"
      ],
      start: 2535,
      end: 2752,
      duration: 217,
      startSeconds: 84.5,
      endSeconds: 91.73333333333333,
      voiceEndSeconds: 91.54,
      voiceDurationSeconds: 7.04,
      audioSHA256: "7ee5ad084af41783720cc6d83e0bfca58060498bc4682046a690b9b2398d4922",
      audio: "voice/g014.wav"
    },
    {
      id: "g015",
      section: "pancreas",
      text: "\u7ED3\u679C\uFF0C\u7279\u5B9A\u7684\u77ED\u7247\u6BB5\u4FC3\u8FDB\u4E86\u80F0\u5C9B\u7D20\u91CA\u653E\uFF1B\u7EC6\u80DE\u5B9E\u9A8C\uFF0C\u4E5F\u8FFD\u5230\u4E86\u5185\u90E8\u7684\u4F20\u4FE1\u8FC7\u7A0B\u3002",
      caption: "\u7ED3\u679C\uFF0C\u7279\u5B9A\u7684\u77ED\u7247\u6BB5\u4FC3\u8FDB\u4E86\u80F0\u5C9B\u7D20\u91CA\u653E\uFF1B\u7EC6\u80DE\u5B9E\u9A8C\uFF0C\u4E5F\u8FFD\u5230\u4E86\u5185\u90E8\u7684\u4F20\u4FE1\u8FC7\u7A0B\u3002",
      focus: "\u6D3B\u6027\u7247\u6BB5\u4FC3\u5206\u6CCC\uFF1BDrucker\u7B49\u5927\u9F20\u80F0\u5C9B\u7EC6\u80DE\u7CFB\u5B9E\u9A8C\u652F\u6301cAMP\u4E0E\u80F0\u5C9B\u7D20\u8868\u8FBE/\u91CA\u653E\uFF0C\u8BC1\u636E\u5C42\u7EA7\u6E05\u695A\u3002",
      sourceIds: [
        "mojsov1987",
        "drucker1987"
      ],
      start: 2752,
      end: 2969,
      duration: 217,
      startSeconds: 91.73333333333333,
      endSeconds: 98.96666666666667,
      voiceEndSeconds: 98.77333333333334,
      voiceDurationSeconds: 7.04,
      audioSHA256: "083582023a2355ec07566efbf77dea367dc0d6a4f3ef28579e0f667efe763087",
      audio: "voice/g015.wav"
    },
    {
      id: "g016",
      section: "pancreas",
      text: "\u8840\u7CD6\u8F83\u9AD8\u65F6\uFF0C\u8FD9\u6761\u6D88\u606F\u5E2E\u52A9\u88C5\u7740\u80F0\u5C9B\u7D20\u7684\u5C0F\u6CE1\u8D34\u4E0A\u7EC6\u80DE\u819C\uFF0C\u628A\u91CC\u9762\u7684\u80F0\u5C9B\u7D20\u91CA\u653E\u51FA\u53BB\u3002",
      caption: "\u8840\u7CD6\u8F83\u9AD8\u65F6\uFF0C\u8FD9\u6761\u6D88\u606F\u5E2E\u52A9\u88C5\u7740\u80F0\u5C9B\u7D20\u7684\u5C0F\u6CE1\u8D34\u4E0A\u7EC6\u80DE\u819C\uFF0C\u628A\u91CC\u9762\u7684\u80F0\u5C9B\u7D20\u91CA\u653E\u51FA\u53BB\u3002",
      focus: "\u03B2\u7EC6\u80DE\u80F0\u5C9B\u7D20\u5206\u6CCC\u5C0F\u6CE1\u4E0E\u7EC6\u80DE\u819C\u878D\u5408\uFF0C\u5185\u5BB9\u7269\u5411\u80DE\u5916\u91CA\u653E\uFF1B\u5916\u90E8\u8840\u7CD6\u8DB3\u591F\u65F6\u589E\u5F3A\uFF0C\u4F4E\u7CD6\u65F6\u51CF\u5F31\u3002",
      sourceIds: [
        "native_half_life",
        "mechanisms2018",
        "wegovy_pi"
      ],
      start: 2969,
      end: 3198,
      duration: 229,
      startSeconds: 98.96666666666667,
      endSeconds: 106.6,
      voiceEndSeconds: 106.40666666666667,
      voiceDurationSeconds: 7.44,
      audioSHA256: "6e5f68ebbdeaadb1c1821d3d490fa310eccc107cd6ff668a889b09e1c2b20dd4",
      audio: "voice/g016.wav"
    },
    {
      id: "g017",
      section: "pancreas",
      text: "\u5B83\u8FD8\u4F1A\u8BA9\u50AC\u4FC3\u809D\u810F\u653E\u7CD6\u7684\u4FE1\u53F7\u51CF\u5F31\uFF0C\u809D\u810F\u4FBF\u5C11\u5F80\u8840\u6DB2\u91CC\u9001\u4E00\u4E9B\u8461\u8404\u7CD6\u3002",
      caption: "\u5B83\u8FD8\u4F1A\u8BA9\u50AC\u4FC3\u809D\u810F\u653E\u7CD6\u7684\u4FE1\u53F7\u51CF\u5F31\uFF0C\u809D\u810F\u4FBF\u5C11\u5F80\u8840\u6DB2\u91CC\u9001\u4E00\u4E9B\u8461\u8404\u7CD6\u3002",
      focus: "\u80F0\u9AD8\u8840\u7CD6\u7D20\u4FE1\u53F7\u51CF\u5F31\u4E0E\u809D\u810F\u8461\u8404\u7CD6\u8F93\u51FA\u51CF\u5C11\uFF1B\u4E0D\u5BA3\u79F0\u5B8C\u5168\u5173\u95ED\u6216\u6240\u6709\u8840\u7CD6\u6761\u4EF6\u90FD\u76F8\u540C\u3002",
      sourceIds: [
        "mechanisms2018",
        "wegovy_pi"
      ],
      start: 3198,
      end: 3379,
      duration: 181,
      startSeconds: 106.6,
      endSeconds: 112.63333333333334,
      voiceEndSeconds: 112.44,
      voiceDurationSeconds: 5.84,
      audioSHA256: "aaa90fc0e2ba3a1fd224233fb2ca29dad86ef8897b6d84d2fbac42e972034000",
      audio: "voice/g017.wav"
    },
    {
      id: "g018",
      section: "pancreas",
      text: "\u4E00\u8FB9\u5E2E\u52A9\u5904\u7406\u8FDB\u6765\u7684\u7CD6\uFF0C\u4E00\u8FB9\u51CF\u5C11\u989D\u5916\u653E\u7CD6\uFF0C\u9910\u540E\u7684\u8840\u7CD6\u5C31\u6709\u4E86\u534F\u540C\u8C03\u8282\u3002",
      caption: "\u4E00\u8FB9\u5E2E\u52A9\u5904\u7406\u8FDB\u6765\u7684\u7CD6\uFF0C\u4E00\u8FB9\u51CF\u5C11\u989D\u5916\u653E\u7CD6\uFF0C\u9910\u540E\u7684\u8840\u7CD6\u5C31\u6709\u4E86\u534F\u540C\u8C03\u8282\u3002",
      focus: "\u80F0\u817A\u3001\u809D\u810F\u3001\u9910\u540E\u8840\u7CD6\u534F\u540C\u753B\u9762\uFF1B\u975E\u80F0\u5C9B\u7D20\u628A\u8461\u8404\u7CD6\u76F4\u63A5\u5403\u6389\u3002",
      sourceIds: [
        "mechanisms2018"
      ],
      start: 3379,
      end: 3574,
      duration: 195,
      startSeconds: 112.63333333333334,
      endSeconds: 119.13333333333334,
      voiceEndSeconds: 118.95333333333335,
      voiceDurationSeconds: 6.32,
      audioSHA256: "13479781ca37a90a7895431f3e3ad0baa404120e5694c6e2d9463d0ef59a26bc",
      audio: "voice/g018.wav"
    },
    {
      id: "g019",
      section: "brain",
      text: "\u4F46\u8981\u7406\u89E3\u4E3A\u4EC0\u4E48\u4F1A\u5C11\u5403\uFF0C\u6211\u4EEC\u8FD8\u5F97\u5F80\u4E0A\u8D70\uFF0C\u53BB\u770B\u770B\u5927\u8111\u6536\u5230\u7684\u6D88\u606F\u3002",
      caption: "\u4F46\u8981\u7406\u89E3\u4E3A\u4EC0\u4E48\u4F1A\u5C11\u5403\uFF0C\u6211\u4EEC\u8FD8\u5F97\u5F80\u4E0A\u8D70\uFF0C\u53BB\u770B\u770B\u5927\u8111\u6536\u5230\u7684\u6D88\u606F\u3002",
      focus: "\u955C\u5934\u6CBF\u4EBA\u4F53\u7531\u8179\u90E8\u5230\u8111\u5E72\u3001\u5927\u8111\uFF0C\u8F6C\u5165\u8FDB\u98DF\u52A8\u673A\u548C\u9971\u8179\u8C03\u8282\u3002",
      sourceIds: [
        "mechanisms2018"
      ],
      start: 3574,
      end: 3750,
      duration: 176,
      startSeconds: 119.13333333333334,
      endSeconds: 125,
      voiceEndSeconds: 124.81333333333333,
      voiceDurationSeconds: 5.68,
      audioSHA256: "e2e0f66deac9e50a039b9f07e7370b57da829b32556742155d9caba826b96386",
      audio: "voice/g019.wav"
    },
    {
      id: "g020",
      section: "brain",
      text: "\u80A0\u9053\u4F1A\u901A\u8FC7\u795E\u7ECF\u7B49\u591A\u6761\u8DEF\u7EBF\uFF0C\u4E0E\u5927\u8111\u6C9F\u901A\u3002\u9965\u997F\u548C\u9971\u8179\uFF0C\u5E76\u975E\u53EA\u7531\u80C3\u91CC\u88C5\u4E86\u591A\u5C11\u51B3\u5B9A\u3002",
      caption: "\u80A0\u9053\u4F1A\u901A\u8FC7\u795E\u7ECF\u7B49\u591A\u6761\u8DEF\u7EBF\uFF0C\u4E0E\u5927\u8111\u6C9F\u901A\u3002\u9965\u997F\u548C\u9971\u8179\uFF0C\u5E76\u975E\u53EA\u7531\u80C3\u91CC\u88C5\u4E86\u591A\u5C11\u51B3\u5B9A\u3002",
      focus: "\u80A0\u8111\u795E\u7ECF\u4E0E\u4F53\u6DB2\u7B49\u591A\u8DEF\u901A\u4FE1\uFF1B\u907F\u514D\u80A0\u6E90GLP-1\u5168\u91CF\u81EA\u7531\u7A7F\u8D8A\u8840\u8111\u5C4F\u969C\u3002",
      sourceIds: [
        "native_half_life",
        "mechanisms2018"
      ],
      start: 3750,
      end: 3981,
      duration: 231,
      startSeconds: 125,
      endSeconds: 132.7,
      voiceEndSeconds: 132.52,
      voiceDurationSeconds: 7.52,
      audioSHA256: "caeffd470bc1fde7661425d2f117cd1c4654caba7abe44a946fb69f9708168e5",
      audio: "voice/g020.wav"
    },
    {
      id: "g021",
      section: "brain",
      text: "\u76F8\u5173\u836F\u7269\u80FD\u6301\u7EED\u6FC0\u6D3B\u8FD9\u79CD\u53D7\u4F53\uFF0C\u8BA9\u98DF\u6B32\u51CF\u8F7B\uFF0C\u66F4\u5BB9\u6613\u89C9\u5F97\u591F\u4E86\uFF0C\u5C11\u5403\u4E00\u4E9B\u3002",
      caption: "\u76F8\u5173\u836F\u7269\u80FD\u6301\u7EED\u6FC0\u6D3B\u8FD9\u79CD\u53D7\u4F53\uFF0C\u8BA9\u98DF\u6B32\u51CF\u8F7B\uFF0C\u66F4\u5BB9\u6613\u89C9\u5F97\u591F\u4E86\uFF0C\u5C11\u5403\u4E00\u4E9B\u3002",
      focus: "\u836F\u7406\u6FC0\u6D3B\u53D7\u4F53\u540E\u98DF\u6B32\u548C\u6444\u5165\u4E0B\u964D\uFF1B\u4FDD\u6301\u4EBA\u4F53\u59FF\u6001\uFF0C\u4E0D\u8981\u6C42\u4F38\u624B\u56DE\u7F29\u52A8\u753B\u3002",
      sourceIds: [
        "appetite_semaglutide",
        "wegovy_pi"
      ],
      start: 3981,
      end: 4171,
      duration: 190,
      startSeconds: 132.7,
      endSeconds: 139.03333333333333,
      voiceEndSeconds: 138.85999999999999,
      voiceDurationSeconds: 6.16,
      audioSHA256: "bee4b34d68b7e2b1d2723f443b8ebe566665b71b916aff57024402e35d9bc61e",
      audio: "voice/g021.wav"
    },
    {
      id: "g022",
      section: "brain",
      text: "\u5B83\u4EEC\u4E5F\u4F1A\u8BA9\u80C3\u6392\u7A7A\u53D8\u6162\u3002\u4E0D\u8FC7\uFF0C\u6301\u7EED\u6CBB\u7597\u4E2D\u7684\u51CF\u91CD\uFF0C\u8FD8\u79BB\u4E0D\u5F00\u98DF\u6B32\u7684\u6539\u53D8\u3002",
      caption: "\u5B83\u4EEC\u4E5F\u4F1A\u8BA9\u80C3\u6392\u7A7A\u53D8\u6162\u3002\u4E0D\u8FC7\uFF0C\u6301\u7EED\u6CBB\u7597\u4E2D\u7684\u51CF\u91CD\uFF0C\u8FD8\u79BB\u4E0D\u5F00\u98DF\u6B32\u7684\u6539\u53D8\u3002",
      focus: "\u80C3\u6392\u7A7A\u51CF\u6162\u4E0E\u98DF\u6B32\u8C03\u8282\u5206\u5F00\u5448\u73B0\uFF1B\u4E0D\u628A\u957F\u671F\u51CF\u91CD\u5168\u5F52\u56E0\u4E8E\u98DF\u7269\u5835\u5728\u80C3\u91CC\u3002",
      sourceIds: [
        "mechanisms2018",
        "appetite_semaglutide"
      ],
      start: 4171,
      end: 4376,
      duration: 205,
      startSeconds: 139.03333333333333,
      endSeconds: 145.86666666666667,
      voiceEndSeconds: 145.673375,
      voiceDurationSeconds: 6.640041666666667,
      audioSHA256: "f831358c5109cca27681f6024925885faa5ba0d2682c6adc4a7ad6965b7f2ad9",
      audio: "voice/g022.wav"
    },
    {
      id: "g023",
      section: "brain",
      text: "\u5403\u8FDB\u53BB\u7684\u80FD\u91CF\u51CF\u5C11\u4E86\uFF0C\u4F53\u91CD\u624D\u5728\u968F\u540E\u6570\u5468\u3001\u6570\u6708\u91CC\u6539\u53D8\uFF0C\u8102\u80AA\u5E76\u4E0D\u4F1A\u77AC\u95F4\u6D88\u5931\u3002",
      caption: "\u5403\u8FDB\u53BB\u7684\u80FD\u91CF\u51CF\u5C11\u4E86\uFF0C\u4F53\u91CD\u624D\u5728\u968F\u540E\u6570\u5468\u3001\u6570\u6708\u91CC\u6539\u53D8\uFF0C\u8102\u80AA\u5E76\u4E0D\u4F1A\u77AC\u95F4\u6D88\u5931\u3002",
      focus: "\u6444\u5165\u51CF\u5C11\u540E\u968F\u5468/\u6708\u63A8\u8FDB\u4F53\u91CD\u6539\u53D8\uFF1B\u7981\u6B62\u836F\u7269\u5206\u5B50\u76F4\u63A5\u6EB6\u89E3\u8102\u80AA\u3002",
      sourceIds: [
        "wegovy_pi",
        "appetite_semaglutide"
      ],
      start: 4376,
      end: 4593,
      duration: 217,
      startSeconds: 145.86666666666667,
      endSeconds: 153.1,
      voiceEndSeconds: 152.90666666666667,
      voiceDurationSeconds: 7.04,
      audioSHA256: "bf89dc30a53545a5c64de28fa941470a41a5af2202f087477bc22da5245d72c4",
      audio: "voice/g023.wav"
    },
    {
      id: "g024",
      section: "brain",
      text: "\u6240\u4EE5\uFF0C\u5403\u591A\u5403\u5C11\u8FD8\u53D7\u5230\u8EAB\u4F53\u4FE1\u53F7\u7684\u5F71\u54CD\uFF0C\u80A5\u80D6\u4E0D\u80FD\u7B80\u5355\u5F52\u7ED3\u4E3A\u4E0D\u591F\u81EA\u5F8B\u3002",
      caption: "\u6240\u4EE5\uFF0C\u5403\u591A\u5403\u5C11\u8FD8\u53D7\u5230\u8EAB\u4F53\u4FE1\u53F7\u7684\u5F71\u54CD\uFF0C\u80A5\u80D6\u4E0D\u80FD\u7B80\u5355\u5F52\u7ED3\u4E3A\u4E0D\u591F\u81EA\u5F8B\u3002",
      focus: "\u8EAB\u4F53\u4FE1\u53F7\u4E0E\u751F\u6D3B\u73AF\u5883\u5171\u540C\u5F71\u54CD\u8FDB\u98DF\uFF1B\u907F\u514D\u7F9E\u8FB1\u4F53\u578B\u6216\u5F52\u548E\u4E2A\u4EBA\u3002",
      sourceIds: [
        "lasker2024",
        "clinic2023"
      ],
      start: 4593,
      end: 4802,
      duration: 209,
      startSeconds: 153.1,
      endSeconds: 160.06666666666666,
      voiceEndSeconds: 159.9,
      voiceDurationSeconds: 6.8,
      audioSHA256: "014a0ba240cb7fc8106f006db774fc8f83d99a399cf53f0985c9850dca481efb",
      audio: "voice/g024.wav"
    },
    {
      id: "g025",
      section: "drug",
      text: "\u53EF\u5929\u7136\u4FE1\u53F7\u6709\u4E2A\u96BE\u9898\uFF1A\u8FDB\u5165\u8840\u6DB2\u540E\uFF0C\u6D3B\u6027\u5927\u7EA6\u4E00\u4E24\u5206\u949F\u5C31\u51CF\u5C11\u4E00\u534A\u3002",
      caption: "\u53EF\u5929\u7136\u4FE1\u53F7\u6709\u4E2A\u96BE\u9898\uFF1A\u8FDB\u5165\u8840\u6DB2\u540E\uFF0C\u6D3B\u6027\u5927\u7EA6\u4E00\u4E24\u5206\u949F\u5C31\u51CF\u5C11\u4E00\u534A\u3002",
      focus: "\u6D3B\u6027\u5185\u6E90GLP-1\u5728\u5FAA\u73AF\u4E2D1\u20132\u5206\u949F\u534A\u8870\u671F\uFF1B\u4E0D\u662F\u6574\u4E2A\u5206\u5B50\u5BFF\u547D\u6216\u603B\u80BD\u91CF\u5168\u90E8\u6D88\u5931\u3002",
      sourceIds: [
        "half_life_review"
      ],
      start: 4802,
      end: 4995,
      duration: 193,
      startSeconds: 160.06666666666666,
      endSeconds: 166.5,
      voiceEndSeconds: 166.30670833333332,
      voiceDurationSeconds: 6.2400416666666665,
      audioSHA256: "b8e87dee77af3a2c80a6e1784f4ce30f9b747dc2824bf72bef0cbb8185c39a33",
      audio: "voice/g025.wav"
    },
    {
      id: "g026",
      section: "drug",
      text: "\u8EAB\u4F53\u91CC\u6709\u4E00\u628A\u5206\u5B50\u526A\u5200\uFF0C\u4F1A\u526A\u6389\u5B83\u5F00\u5934\u7684\u4E00\u5C0F\u6BB5\uFF0C\u8BA9\u5B83\u5F88\u5FEB\u5931\u53BB\u539F\u6765\u7684\u6D3B\u6027\u3002",
      caption: "\u8EAB\u4F53\u91CC\u6709\u4E00\u628A\u5206\u5B50\u526A\u5200\uFF0C\u4F1A\u526A\u6389\u5B83\u5F00\u5934\u7684\u4E00\u5C0F\u6BB5\uFF0C\u8BA9\u5B83\u5F88\u5FEB\u5931\u53BB\u539F\u6765\u7684\u6D3B\u6027\u3002",
      focus: "DPP-4\u526A\u53BB\u6D3B\u6027GLP-1 N\u7AEF\u4E8C\u80BD\uFF1B\u6B64\u5904\u4E0D\u540C\u4E8E\u524D\u4F53\u52A0\u5DE5\u51FA\u6D3B\u6027\u7247\u6BB5\u3002",
      sourceIds: [
        "native_half_life",
        "lasker2024"
      ],
      start: 4995,
      end: 5192,
      duration: 197,
      startSeconds: 166.5,
      endSeconds: 173.06666666666666,
      voiceEndSeconds: 172.9,
      voiceDurationSeconds: 6.4,
      audioSHA256: "8d1b14a201c534dc2330e788e97aa5847cf63a83ae6f950b6fcf7a0eab297278",
      audio: "voice/g026.wav"
    },
    {
      id: "g027",
      section: "drug",
      text: "\u60F3\u628A\u8FD9\u79CD\u4FE1\u53F7\u505A\u6210\u836F\uFF0C\u5C31\u5F97\u8BA9\u5B83\u4FDD\u7559\u4F5C\u7528\uFF0C\u540C\u65F6\u5728\u8EAB\u4F53\u91CC\u591A\u5F85\u4E00\u4F1A\u513F\u3002",
      caption: "\u60F3\u628A\u8FD9\u79CD\u4FE1\u53F7\u505A\u6210\u836F\uFF0C\u5C31\u5F97\u8BA9\u5B83\u4FDD\u7559\u4F5C\u7528\uFF0C\u540C\u65F6\u5728\u8EAB\u4F53\u91CC\u591A\u5F85\u4E00\u4F1A\u513F\u3002",
      focus: "\u5B9E\u9A8C\u5BA4\u8BBE\u8BA1\u7531\u5929\u7136GLP-1\u8F6C\u5411\u5EF6\u957F\u4F5C\u7528\u7684\u7C7B\u4F3C\u7269\u3002",
      sourceIds: [
        "lasker2024",
        "semaglutide2015"
      ],
      start: 5192,
      end: 5351,
      duration: 159,
      startSeconds: 173.06666666666666,
      endSeconds: 178.36666666666667,
      voiceEndSeconds: 178.18666666666667,
      voiceDurationSeconds: 5.12,
      audioSHA256: "f5d1ce8a9dd07d794ea2851c9d3732dc922f1fbb17ba8542e4d3094774fbe44a",
      audio: "voice/g027.wav"
    },
    {
      id: "g028",
      section: "drug",
      text: "\u4EE5\u53F8\u7F8E\u683C\u9C81\u80BD\u4E3A\u4F8B\uFF0C\u7814\u7A76\u8005\u6362\u6389\u4E00\u4E2A\u5BB9\u6613\u88AB\u526A\u7684\u4F4D\u7F6E\uFF0C\u8BA9\u5206\u5B50\u526A\u5200\u4E0D\u5BB9\u6613\u4E0B\u624B\u3002",
      caption: "\u4EE5\u53F8\u7F8E\u683C\u9C81\u80BD\u4E3A\u4F8B\uFF0C\u7814\u7A76\u8005\u6362\u6389\u4E00\u4E2A\u5BB9\u6613\u88AB\u526A\u7684\u4F4D\u7F6E\uFF0C\u8BA9\u5206\u5B50\u526A\u5200\u4E0D\u5BB9\u6613\u4E0B\u624B\u3002",
      focus: "\u53F8\u7F8E\u683C\u9C81\u80BDAib8\u53D6\u4EE3\uFF0C\u62B5\u6297DPP-4\u526A\u5207\uFF1B\u4E0D\u8981\u8868\u73B0\u6210\u6240\u6709\u6C28\u57FA\u9178\u90FD\u88AB\u66FF\u6362\u3002",
      sourceIds: [
        "semaglutide2015"
      ],
      start: 5351,
      end: 5560,
      duration: 209,
      startSeconds: 178.36666666666667,
      endSeconds: 185.33333333333334,
      voiceEndSeconds: 185.16666666666669,
      voiceDurationSeconds: 6.8,
      audioSHA256: "74aae4da9a24a62bf2e8014f291ef39b24863bc4c0ee350c002660a7a0ef1da2",
      audio: "voice/g028.wav"
    },
    {
      id: "g029",
      section: "drug",
      text: "\u518D\u7ED9\u5B83\u63A5\u4E0A\u4E00\u6761\u4FA7\u94FE\uFF0C\u8BA9\u5B83\u80FD\u6682\u65F6\u642D\u4E0A\u8840\u6DB2\u4E2D\u7684\u767D\u86CB\u767D\uFF0C\u51CF\u6162\u88AB\u6E05\u9664\u7684\u901F\u5EA6\u3002",
      caption: "\u518D\u7ED9\u5B83\u63A5\u4E0A\u4E00\u6761\u4FA7\u94FE\uFF0C\u8BA9\u5B83\u80FD\u6682\u65F6\u642D\u4E0A\u8840\u6DB2\u4E2D\u7684\u767D\u86CB\u767D\uFF0C\u51CF\u6162\u88AB\u6E05\u9664\u7684\u901F\u5EA6\u3002",
      focus: "C18\u8102\u80AA\u4E8C\u9178\u4FA7\u94FE\u53EF\u9006\u7ED3\u5408\u767D\u86CB\u767D\uFF0C\u51CF\u6162\u6E05\u9664\uFF1B\u767D\u86CB\u767D\u4E0D\u6C38\u4E45\u5305\u4F4F\u5206\u5B50\u3002",
      sourceIds: [
        "semaglutide2015",
        "wegovy_pi"
      ],
      start: 5560,
      end: 5755,
      duration: 195,
      startSeconds: 185.33333333333334,
      endSeconds: 191.83333333333334,
      voiceEndSeconds: 191.65333333333334,
      voiceDurationSeconds: 6.32,
      audioSHA256: "752cabe725767eb272a7c9c9c86b7427c7b9564f325a45383c2154b6259e54a1",
      audio: "voice/g029.wav"
    },
    {
      id: "g030",
      section: "drug",
      text: "\u8FD9\u4E9B\u6539\u9020\uFF0C\u628A\u5B83\u7684\u534A\u8870\u671F\u5EF6\u957F\u5230\u7EA6\u4E00\u5468\uFF0C\u652F\u6301\u6BCF\u5468\u4E00\u6B21\u7684\u76AE\u4E0B\u6CE8\u5C04\u3002",
      caption: "\u8FD9\u4E9B\u6539\u9020\uFF0C\u628A\u5B83\u7684\u534A\u8870\u671F\u5EF6\u957F\u5230\u7EA6\u4E00\u5468\uFF0C\u652F\u6301\u6BCF\u5468\u4E00\u6B21\u7684\u76AE\u4E0B\u6CE8\u5C04\u3002",
      focus: "\u5929\u7136GLP-1\u5206\u949F\u5C3A\u5EA6\u4E0E\u6CE8\u5C04\u53F8\u7F8E\u683C\u9C81\u80BD\u7EA6\u4E00\u5468\u5E76\u5217\uFF1B\u6BCF\u5468\u4E00\u6B21\u662F\u6CE8\u5C04\u5242\u578B\u3002",
      sourceIds: [
        "wegovy_pi"
      ],
      start: 5755,
      end: 5919,
      duration: 164,
      startSeconds: 191.83333333333334,
      endSeconds: 197.3,
      voiceEndSeconds: 197.11333333333334,
      voiceDurationSeconds: 5.28,
      audioSHA256: "a8c0e7146c6a24c5101bce95444636a3318572cc912aeb5287ab56cd070c9d78",
      audio: "voice/g030.wav"
    },
    {
      id: "g031",
      section: "drug",
      text: "\u8FD8\u6709\u836F\u7269\u4F1A\u540C\u65F6\u542F\u52A8\u4E24\u79CD\u53D7\u4F53\uFF0C\u6BD4\u5982\u66FF\u5C14\u6CCA\u80BD\u3002\u5B83\u4E0E\u53F8\u7F8E\u683C\u9C81\u80BD\uFF0C\u4E0D\u80FD\u5F53\u6210\u540C\u4E00\u79CD\u836F\u3002",
      caption: "\u8FD8\u6709\u836F\u7269\u4F1A\u540C\u65F6\u542F\u52A8\u4E24\u79CD\u53D7\u4F53\uFF0C\u6BD4\u5982\u66FF\u5C14\u6CCA\u80BD\u3002\u5B83\u4E0E\u53F8\u7F8E\u683C\u9C81\u80BD\uFF0C\u4E0D\u80FD\u5F53\u6210\u540C\u4E00\u79CD\u836F\u3002",
      focus: "\u5355GLP-1R\u4E0EGIP/GLP-1\u53CC\u53D7\u4F53\u533A\u5206\uFF1B\u4E0B\u6587\u4E34\u5E8A\u6570\u5B57\u4EC5\u6307\u53F8\u7F8E\u683C\u9C81\u80BD\uFF0C\u4E0D\u4EA4\u53C9\u5F15\u7528\u3002",
      sourceIds: [
        "tirzepatide2022"
      ],
      start: 5919,
      end: 6152,
      duration: 233,
      startSeconds: 197.3,
      endSeconds: 205.06666666666666,
      voiceEndSeconds: 204.9,
      voiceDurationSeconds: 7.6,
      audioSHA256: "e3af555c29f486981bf38f022ff16cdf921bc9f8daf2e9b27ce0ac3109bbfb22",
      audio: "voice/g031.wav"
    },
    {
      id: "g032",
      section: "trial",
      text: "\u5206\u5B50\u8BBE\u8BA1\u5F97\u5DE7\uFF0C\u5230\u4E86\u4EBA\u8EAB\u4E0A\u7A76\u7ADF\u6709\u6CA1\u6709\u7528\uFF1F\u8FD9\u5C31\u8981\u8BF7\u4E34\u5E8A\u8BD5\u9A8C\u6765\u56DE\u7B54\u3002",
      caption: "\u5206\u5B50\u8BBE\u8BA1\u5F97\u5DE7\uFF0C\u5230\u4E86\u4EBA\u8EAB\u4E0A\u7A76\u7ADF\u6709\u6CA1\u6709\u7528\uFF1F\u8FD9\u5C31\u8981\u8BF7\u4E34\u5E8A\u8BD5\u9A8C\u6765\u56DE\u7B54\u3002",
      focus: "\u4ECE\u5206\u5B50\u8BBE\u8BA1\u8F6C\u5165\u771F\u5B9E\u8BD5\u9A8C\u8BBA\u6587\u548C\u968F\u673A\u5206\u7EC4\u3002",
      sourceIds: [
        "step1"
      ],
      start: 6152,
      end: 6323,
      duration: 171,
      startSeconds: 205.06666666666666,
      endSeconds: 210.76666666666668,
      voiceEndSeconds: 210.58666666666667,
      voiceDurationSeconds: 5.52,
      audioSHA256: "d61ebc8fad234b26a4ee27fee6fc9d72ec620117a3ad976c22a2560ba0e08b06",
      audio: "voice/g032.wav"
    },
    {
      id: "g033",
      section: "trial",
      text: "\u4E00\u9879\u7814\u7A76\u627E\u6765\u7EA6\u4E24\u5343\u540D\u6CA1\u6709\u7CD6\u5C3F\u75C5\u3001\u7B26\u5408\u8D85\u91CD\u6216\u80A5\u80D6\u6761\u4EF6\u7684\u6210\u5E74\u4EBA\uFF0C\u968F\u673A\u5206\u7EC4\u3002",
      caption: "\u4E00\u9879\u7814\u7A76\u627E\u6765\u7EA6\u4E24\u5343\u540D\u6CA1\u6709\u7CD6\u5C3F\u75C5\u3001\u7B26\u5408\u8D85\u91CD\u6216\u80A5\u80D6\u6761\u4EF6\u7684\u6210\u5E74\u4EBA\uFF0C\u968F\u673A\u5206\u7EC4\u3002",
      focus: "STEP 1\uFF1A1961\u540D\u6210\u4EBA\uFF0C\u65E0\u7CD6\u5C3F\u75C5\uFF1BBMI\u226530\u6216\u226527\u4F34\u81F3\u5C11\u4E00\u79CD\u76F8\u5173\u5408\u5E76\u75C7\u3002",
      sourceIds: [
        "step1"
      ],
      start: 6323,
      end: 6547,
      duration: 224,
      startSeconds: 210.76666666666668,
      endSeconds: 218.23333333333332,
      voiceEndSeconds: 218.04666666666668,
      voiceDurationSeconds: 7.28,
      audioSHA256: "39f3e9fd903b7a6653b5bcf5fe9662acaa123ff5b9feb4c1f22c3e41a6b1949a",
      audio: "voice/g033.wav"
    },
    {
      id: "g034",
      section: "trial",
      text: "\u4E24\u7EC4\u90FD\u5F97\u5230\u996E\u98DF\u548C\u8FD0\u52A8\u6307\u5BFC\uFF0C\u4E00\u7EC4\u6BCF\u5468\u6CE8\u5C04\u53F8\u7F8E\u683C\u9C81\u80BD\uFF0C\u53E6\u4E00\u7EC4\u6CE8\u5C04\u5B89\u6170\u5242\u3002",
      caption: "\u4E24\u7EC4\u90FD\u5F97\u5230\u996E\u98DF\u548C\u8FD0\u52A8\u6307\u5BFC\uFF0C\u4E00\u7EC4\u6BCF\u5468\u6CE8\u5C04\u53F8\u7F8E\u683C\u9C81\u80BD\uFF0C\u53E6\u4E00\u7EC4\u6CE8\u5C04\u5B89\u6170\u5242\u3002",
      focus: "STEP 1\u4E24\u7EC4\u5747\u751F\u6D3B\u65B9\u5F0F\u5E72\u9884\uFF1B\u53F8\u7F8E\u683C\u9C81\u80BD\u76EE\u68072.4 mg/\u5468\u4E0E\u5B89\u6170\u5242\uFF0C68\u5468\u3002",
      sourceIds: [
        "step1"
      ],
      start: 6547,
      end: 6749,
      duration: 202,
      startSeconds: 218.23333333333332,
      endSeconds: 224.96666666666667,
      voiceEndSeconds: 224.79333333333332,
      voiceDurationSeconds: 6.56,
      audioSHA256: "114ea0eff160b9c190e04480bfa7756f4493493e0066d65d16b3e78dfcb79017",
      audio: "voice/g034.wav"
    },
    {
      id: "g035",
      section: "trial",
      text: "\u516D\u5341\u516B\u5468\u540E\uFF0C\u836F\u7269\u7EC4\u5E73\u5747\u51CF\u91CD\u767E\u5206\u4E4B\u5341\u56DB\u70B9\u4E5D\uFF0C\u5B89\u6170\u5242\u7EC4\u662F\u767E\u5206\u4E4B\u4E8C\u70B9\u56DB\u3002",
      caption: "\u516D\u5341\u516B\u5468\u540E\uFF0C\u836F\u7269\u7EC4\u5E73\u5747\u51CF\u91CD\u767E\u5206\u4E4B\u5341\u56DB\u70B9\u4E5D\uFF0C\u5B89\u6170\u5242\u7EC4\u662F\u767E\u5206\u4E4B\u4E8C\u70B9\u56DB\u3002",
      focus: "STEP 1\u540C\u4E00\u57FA\u7EBF\u4E24\u6761\u4F53\u91CD\u66F2\u7EBF\uFF1A\u221214.9%\u4E0E\u22122.4%\uFF0C\u5E73\u5747\u53D8\u5316\u3002",
      sourceIds: [
        "step1"
      ],
      start: 6749,
      end: 6944,
      duration: 195,
      startSeconds: 224.96666666666667,
      endSeconds: 231.46666666666667,
      voiceEndSeconds: 231.28666666666666,
      voiceDurationSeconds: 6.32,
      audioSHA256: "8b2dea6f7e8f37ab76307fdf3e623258beb3bcafb28d200ac2351b8eab7ec039",
      audio: "voice/g035.wav"
    },
    {
      id: "g036",
      section: "trial",
      text: "\u8FD9\u662F\u4E24\u7EC4\u4EBA\u7684\u5E73\u5747\u503C\uFF0C\u6709\u4EBA\u51CF\u5F97\u591A\uFF0C\u6709\u4EBA\u51CF\u5F97\u5C11\uFF0C\u4E0D\u80FD\u5F53\u4F5C\u6BCF\u4E2A\u4EBA\u7684\u4FDD\u8BC1\u3002",
      caption: "\u8FD9\u662F\u4E24\u7EC4\u4EBA\u7684\u5E73\u5747\u503C\uFF0C\u6709\u4EBA\u51CF\u5F97\u591A\uFF0C\u6709\u4EBA\u51CF\u5F97\u5C11\uFF0C\u4E0D\u80FD\u5F53\u4F5C\u6BCF\u4E2A\u4EBA\u7684\u4FDD\u8BC1\u3002",
      focus: "\u7EF4\u6301\u7EC4\u5747\u503C\uFF0C\u540C\u65F6\u663E\u793A\u4E2A\u4F53\u7ED3\u679C\u4E0D\u540C\uFF0C\u907F\u514D\u4EBA\u4EBA\u76F8\u540C\u7684\u627F\u8BFA\u3002",
      sourceIds: [
        "step1"
      ],
      start: 6944,
      end: 7132,
      duration: 188,
      startSeconds: 231.46666666666667,
      endSeconds: 237.73333333333332,
      voiceEndSeconds: 237.54666666666668,
      voiceDurationSeconds: 6.08,
      audioSHA256: "d4c3e689705e20f49301e70067b1e66adae20f1113cf2b302d5f484be29be920",
      audio: "voice/g036.wav"
    },
    {
      id: "g037",
      section: "trial",
      text: "\u53E6\u4E00\u9879\u8BD5\u9A8C\uFF0C\u5173\u6CE8\u5DF2\u6709\u5FC3\u8840\u7BA1\u75C5\u3001\u8D85\u91CD\u6216\u80A5\u80D6\uFF0C\u540C\u65F6\u6CA1\u6709\u7CD6\u5C3F\u75C5\u7684\u4EBA\u3002",
      caption: "\u53E6\u4E00\u9879\u8BD5\u9A8C\uFF0C\u5173\u6CE8\u5DF2\u6709\u5FC3\u8840\u7BA1\u75C5\u3001\u8D85\u91CD\u6216\u80A5\u80D6\uFF0C\u540C\u65F6\u6CA1\u6709\u7CD6\u5C3F\u75C5\u7684\u4EBA\u3002",
      focus: "SELECT\uFF1A17604\u4EBA\uFF0C\u226545\u5C81\uFF0C\u65E2\u5F80\u5FC3\u8840\u7BA1\u75C5\uFF0CBMI\u226527\uFF0C\u65E0\u7CD6\u5C3F\u75C5\u3002",
      sourceIds: [
        "select"
      ],
      start: 7132,
      end: 7320,
      duration: 188,
      startSeconds: 237.73333333333332,
      endSeconds: 244,
      voiceEndSeconds: 243.81333333333333,
      voiceDurationSeconds: 6.08,
      audioSHA256: "fb186546f1bd58807f7d9349f425b7b64b2d8bcb270685055b75d7cd0293d143",
      audio: "voice/g037.wav"
    },
    {
      id: "g038",
      section: "trial",
      text: "\u5E73\u5747\u968F\u8BBF\u7EA6\u56DB\u5341\u4E2A\u6708\uFF0C\u4E3B\u8981\u5FC3\u8840\u7BA1\u4E8B\u4EF6\u53D1\u751F\u7387\uFF0C\u836F\u7269\u7EC4\u4E3A\u767E\u5206\u4E4B\u516D\u70B9\u4E94\uFF0C\u5B89\u6170\u5242\u7EC4\u4E3A\u767E\u5206\u4E4B\u516B\u3002",
      caption: "\u5E73\u5747\u968F\u8BBF\u7EA6\u56DB\u5341\u4E2A\u6708\uFF0C\u4E3B\u8981\u5FC3\u8840\u7BA1\u4E8B\u4EF6\u53D1\u751F\u7387\uFF0C\u836F\u7269\u7EC4\u4E3A\u767E\u5206\u4E4B\u516D\u70B9\u4E94\uFF0C\u5B89\u6170\u5242\u7EC4\u4E3A\u767E\u5206\u4E4B\u516B\u3002",
      focus: "SELECT\u5E73\u5747\u968F\u8BBF39.8\u4E2A\u6708\uFF1B\u9996\u6B21\u4E3B\u8981\u7EC8\u70B9\u4E8B\u4EF6\u4EBA\u6570\u6BD4\u4F8B6.5%\u4E0E8.0%\uFF0C\u7EC8\u70B9\u4E3A\u5FC3\u8840\u7BA1\u6B7B\u4EA1/\u975E\u81F4\u6B7B\u5FC3\u6897/\u975E\u81F4\u6B7B\u5352\u4E2D\u3002",
      sourceIds: [
        "select"
      ],
      start: 7320,
      end: 7553,
      duration: 233,
      startSeconds: 244,
      endSeconds: 251.76666666666668,
      voiceEndSeconds: 251.6,
      voiceDurationSeconds: 7.6,
      audioSHA256: "e7d95ee188165ddd0f1b697f817577ea191b8ef627e990b30f2ed042fd93e2be",
      audio: "voice/g038.wav"
    },
    {
      id: "g039",
      section: "trial",
      text: "\u76F8\u5F53\u4E8E\u6BCF\u4E00\u767E\u4EBA\uFF0C\u836F\u7269\u7EC4\u5C11\u7EA6\u4E00\u70B9\u4E94\u4EBA\u53D1\u751F\u8FD9\u7C7B\u4E8B\u4EF6\uFF0C\u83B7\u76CA\u5C31\u66F4\u6709\u5C3A\u5EA6\u4E86\u3002",
      caption: "\u76F8\u5F53\u4E8E\u6BCF\u4E00\u767E\u4EBA\uFF0C\u836F\u7269\u7EC4\u5C11\u7EA6\u4E00\u70B9\u4E94\u4EBA\u53D1\u751F\u8FD9\u7C7B\u4E8B\u4EF6\uFF0C\u83B7\u76CA\u5C31\u66F4\u6709\u5C3A\u5EA6\u4E86\u3002",
      focus: "\u6BCF100\u540D\u53D7\u8BD5\u8005\u5E73\u5747\u76F8\u5DEE\u7EA61.5\u540D\u53D1\u751F\u9996\u6B21\u4E3B\u8981\u7EC8\u70B9\u4E8B\u4EF6\uFF1B\u56FE\u793A\u5C0F\u6570\u662F\u7FA4\u4F53\u5C3A\u5EA6\u6362\u7B97\uFF0C\u4E0D\u628A\u590D\u53D1\u4E8B\u4EF6\u6B21\u6570\u5F53\u4EBA\u6570\u3002",
      sourceIds: [
        "select"
      ],
      start: 7553,
      end: 7770,
      duration: 217,
      startSeconds: 251.76666666666668,
      endSeconds: 259,
      voiceEndSeconds: 258.8066666666667,
      voiceDurationSeconds: 7.04,
      audioSHA256: "e9c6d17aac00fd722f0074aa723a94200230fb9c9fbc9103f3d096f63e7bb3a1",
      audio: "voice/g039.wav"
    },
    {
      id: "g040",
      section: "trial",
      text: "\u4F46\u836F\u7269\u4E5F\u4F1A\u5E26\u6765\u6076\u5FC3\u3001\u5455\u5410\u3001\u8179\u6CFB\u7B49\u4E0D\u9002\uFF0C\u6709\u4E9B\u4EBA\u4F1A\u56E0\u6B64\u505C\u6B62\u6CBB\u7597\u3002",
      caption: "\u4F46\u836F\u7269\u4E5F\u4F1A\u5E26\u6765\u6076\u5FC3\u3001\u5455\u5410\u3001\u8179\u6CFB\u7B49\u4E0D\u9002\uFF0C\u6709\u4E9B\u4EBA\u4F1A\u56E0\u6B64\u505C\u6B62\u6CBB\u7597\u3002",
      focus: "\u6076\u5FC3\u3001\u5455\u5410\u3001\u8179\u6CFB\u4E0E\u505C\u836F\u53EF\u80FD\uFF1B\u5B8C\u6574\u7528\u836F\u98CE\u9669\u548C\u9002\u7528\u6761\u4EF6\u89C1\u539F\u8BF4\u660E\u4E66\u3002",
      sourceIds: [
        "step1",
        "select",
        "wegovy_pi"
      ],
      start: 7770,
      end: 7953,
      duration: 183,
      startSeconds: 259,
      endSeconds: 265.1,
      voiceEndSeconds: 264.92,
      voiceDurationSeconds: 5.92,
      audioSHA256: "ed8a47a2a93f68103dd75a15540320135bd90ab93f36a4bfd210b7f230661cf9",
      audio: "voice/g040.wav"
    },
    {
      id: "g041",
      section: "trial",
      text: "\u800C\u5728\u4E00\u9879\u5EF6\u4F38\u7814\u7A76\u91CC\uFF0C\u505C\u836F\u5E76\u7ED3\u675F\u8BD5\u9A8C\u7684\u996E\u98DF\u8FD0\u52A8\u6307\u5BFC\u4E00\u5E74\u540E\uFF0C\u4F53\u91CD\u660E\u663E\u56DE\u5347\u3002",
      caption: "\u800C\u5728\u4E00\u9879\u5EF6\u4F38\u7814\u7A76\u91CC\uFF0C\u505C\u836F\u5E76\u7ED3\u675F\u8BD5\u9A8C\u7684\u996E\u98DF\u8FD0\u52A8\u6307\u5BFC\u4E00\u5E74\u540E\uFF0C\u4F53\u91CD\u660E\u663E\u56DE\u5347\u3002",
      focus: "STEP 1\u5EF6\u4F38327\u4EBA\uFF1B\u836F\u7269\u4E0E\u8BD5\u9A8C\u751F\u6D3B\u65B9\u5F0F\u652F\u6301\u5747\u505C\u6B62\uFF0C52\u5468\u968F\u8BBF\uFF0C\u4E0D\u80FD\u5355\u72EC\u5F52\u56E0\u505C\u836F\u3002",
      sourceIds: [
        "withdrawal"
      ],
      start: 7953,
      end: 8148,
      duration: 195,
      startSeconds: 265.1,
      endSeconds: 271.6,
      voiceEndSeconds: 271.42,
      voiceDurationSeconds: 6.32,
      audioSHA256: "80410644810a2ffa150272c32886bf5866f38c69f235b390ec238011673b04ee",
      audio: "voice/g041.wav"
    },
    {
      id: "g042",
      section: "trial",
      text: "\u539F\u836F\u7269\u7EC4\u5E73\u5747\u957F\u56DE\u4E86\u6B64\u524D\u51CF\u6389\u4F53\u91CD\u7684\u7EA6\u4E09\u5206\u4E4B\u4E8C\uFF0C\u4ECD\u672A\u5B8C\u5168\u56DE\u5230\u8D77\u70B9\u3002",
      caption: "\u539F\u836F\u7269\u7EC4\u5E73\u5747\u957F\u56DE\u4E86\u6B64\u524D\u51CF\u6389\u4F53\u91CD\u7684\u7EA6\u4E09\u5206\u4E4B\u4E8C\uFF0C\u4ECD\u672A\u5B8C\u5168\u56DE\u5230\u8D77\u70B9\u3002",
      focus: "\u539F\u53F8\u7F8E\u683C\u9C81\u80BD\u7EC4\u5E73\u5747\u6062\u590D\u6B64\u524D\u51CF\u91CD\u7684\u7EA62/3\uFF0C\u672B\u671F\u4ECD\u4F4E\u4E8E\u57FA\u7EBF\uFF1B\u4E0D\u662F\u6240\u6709\u4EBA\u6216\u5168\u90E8\u4F53\u91CD\u6062\u590D\u3002",
      sourceIds: [
        "withdrawal"
      ],
      ttsText: "\u539F\u836F\u7269\u7EC4\u5E73\u5747\u6DA8\u56DE\u4E86\u6B64\u524D\u51CF\u6389\u4F53\u91CD\u7684\u7EA6\u4E09\u5206\u4E4B\u4E8C\uFF0C\u4ECD\u672A\u5B8C\u5168\u56DE\u5230\u8D77\u70B9\u3002",
      start: 8148,
      end: 8331,
      duration: 183,
      startSeconds: 271.6,
      endSeconds: 277.7,
      voiceEndSeconds: 277.52000000000004,
      voiceDurationSeconds: 5.92,
      audioSHA256: "9195f3853d6fdf8a8254eda06fe33319f8de2bc2ebb5e1b9871e7fc7ea326389",
      audio: "voice/g042.wav"
    },
    {
      id: "g043",
      section: "daily",
      text: "\u8FD9\u63D0\u9192\u6211\u4EEC\uFF0C\u6CBB\u7597\u4E0D\u662F\u628A\u8EAB\u4F53\u7684\u5F00\u5173\u6C38\u4E45\u62E8\u597D\uFF0C\u540E\u7EED\u7684\u4F53\u91CD\u548C\u5065\u5EB7\u4ECD\u9700\u7BA1\u7406\u3002",
      caption: "\u8FD9\u63D0\u9192\u6211\u4EEC\uFF0C\u6CBB\u7597\u4E0D\u662F\u628A\u8EAB\u4F53\u7684\u5F00\u5173\u6C38\u4E45\u62E8\u597D\uFF0C\u540E\u7EED\u7684\u4F53\u91CD\u548C\u5065\u5EB7\u4ECD\u9700\u7BA1\u7406\u3002",
      focus: "\u957F\u671F\u4F53\u91CD\u4E0E\u5065\u5EB7\u76D1\u6D4B\u8FDB\u5165\u65E5\u5E38\u751F\u6D3B\uFF1B\u4E0D\u518D\u56DE\u5230\u8BFA\u5956\u4FDD\u5BC6\u89E3\u91CA\u3002",
      sourceIds: [
        "withdrawal",
        "clinic2023"
      ],
      start: 8331,
      end: 8538,
      duration: 207,
      startSeconds: 277.7,
      endSeconds: 284.6,
      voiceEndSeconds: 284.42,
      voiceDurationSeconds: 6.72,
      audioSHA256: "af696351836643cdb5213aed2dd8c70443051cc201fdd4b5488b264b96b31dcf",
      audio: "voice/g043.wav"
    },
    {
      id: "g044",
      section: "daily",
      text: "\u600E\u4E48\u5403\uFF0C\u600E\u6837\u6D3B\u52A8\uFF0C\u6CBB\u7597\u80FD\u5426\u8010\u53D7\uFF0C\u90FD\u9700\u8981\u653E\u8FDB\u9002\u5408\u81EA\u5DF1\u7684\u957F\u671F\u65B9\u6848\u91CC\u3002",
      caption: "\u600E\u4E48\u5403\uFF0C\u600E\u6837\u6D3B\u52A8\uFF0C\u6CBB\u7597\u80FD\u5426\u8010\u53D7\uFF0C\u90FD\u9700\u8981\u653E\u8FDB\u9002\u5408\u81EA\u5DF1\u7684\u957F\u671F\u65B9\u6848\u91CC\u3002",
      focus: "\u996E\u98DF\u3001\u6D3B\u52A8\u548C\u6CBB\u7597\u8010\u53D7\u7EC4\u6210\u957F\u671F\u7BA1\u7406\uFF1B\u4E2A\u4EBA\u65B9\u6848\u9700\u4E34\u5E8A\u8BC4\u4F30\u3002",
      sourceIds: [
        "clinic2023",
        "wegovy_pi"
      ],
      start: 8538,
      end: 8731,
      duration: 193,
      startSeconds: 284.6,
      endSeconds: 291.03333333333336,
      voiceEndSeconds: 290.8400416666667,
      voiceDurationSeconds: 6.2400416666666665,
      audioSHA256: "7ac77c9c6ac5dab36c3f96394bbe838d1264f7dab792d7266c6bdc81b610da6e",
      audio: "voice/g044.wav"
    },
    {
      id: "g045",
      section: "daily",
      text: "\u56DE\u770B\u8FD9\u6BB5\u53D1\u73B0\uFF1A\u5148\u627E\u5230\u80A0\u9053\u53D1\u51FA\u7684\u6D88\u606F\uFF0C\u518D\u8BA9\u5B83\u591A\u7559\u4E00\u4F1A\u513F\uFF0C\u6700\u540E\u7528\u8BD5\u9A8C\u68C0\u9A8C\u6548\u679C\u3002",
      caption: "\u56DE\u770B\u8FD9\u6BB5\u53D1\u73B0\uFF1A\u5148\u627E\u5230\u80A0\u9053\u53D1\u51FA\u7684\u6D88\u606F\uFF0C\u518D\u8BA9\u5B83\u591A\u7559\u4E00\u4F1A\u513F\uFF0C\u6700\u540E\u7528\u8BD5\u9A8C\u68C0\u9A8C\u6548\u679C\u3002",
      focus: "\u7528\u53D1\u73B0\u2014\u6539\u9020\u2014\u9A8C\u8BC1\u4E09\u4E2A\u5DF2\u8BB2\u52A8\u4F5C\u56DE\u987E\uFF0C\u7814\u7A76\u5E74\u4EFD\u6309\u771F\u5B9E\u987A\u5E8F\u6392\u5217\u3002",
      sourceIds: [
        "mojsov1987",
        "semaglutide2015",
        "step1"
      ],
      start: 8731,
      end: 8950,
      duration: 219,
      startSeconds: 291.03333333333336,
      endSeconds: 298.3333333333333,
      voiceEndSeconds: 298.15333333333336,
      voiceDurationSeconds: 7.12,
      audioSHA256: "e0f205487f6db883dee6732a9119144e548bdd166273a4e28b03e4ddb59b25d7",
      audio: "voice/g045.wav"
    },
    {
      id: "g046",
      section: "daily",
      text: "\u5C0F\u5C0F\u7684\u4FE1\u53F7\uFF0C\u7ECF\u8FC7\u51E0\u5341\u5E74\u7684\u7814\u7A76\uFF0C\u624D\u8D70\u51FA\u5B9E\u9A8C\u5BA4\uFF0C\u6210\u4E3A\u533B\u751F\u624B\u91CC\u7684\u6CBB\u7597\u5DE5\u5177\u3002",
      caption: "\u5C0F\u5C0F\u7684\u4FE1\u53F7\uFF0C\u7ECF\u8FC7\u51E0\u5341\u5E74\u7684\u7814\u7A76\uFF0C\u624D\u8D70\u51FA\u5B9E\u9A8C\u5BA4\uFF0C\u6210\u4E3A\u533B\u751F\u624B\u91CC\u7684\u6CBB\u7597\u5DE5\u5177\u3002",
      focus: "\u51E0\u5341\u5E74\u7814\u7A76\u63A5\u529B\u4ECE\u5B9E\u9A8C\u5BA4\u5230\u4E34\u5E8A\u5DE5\u5177\uFF1B\u4E0D\u518D\u6B21\u5207\u5165\u5956\u9879\u4E89\u8BBA\u3002",
      sourceIds: [
        "lasker2024"
      ],
      start: 8950,
      end: 9133,
      duration: 183,
      startSeconds: 298.3333333333333,
      endSeconds: 304.43333333333334,
      voiceEndSeconds: 304.25333333333333,
      voiceDurationSeconds: 5.92,
      audioSHA256: "d19e2ab6db42b36b3c2d2308b895560e2f42f07fe715283cae691d86253946f4",
      audio: "voice/g046.wav"
    },
    {
      id: "g047",
      section: "outro",
      text: "\u518D\u56DE\u5230\u90A3\u987F\u665A\u996D\u3002\u4F60\u60F3\u4E0D\u60F3\u7EE7\u7EED\u5403\uFF0C\u80CC\u540E\u6709\u80A0\u9053\u3001\u80F0\u817A\u548C\u5927\u8111\u4E00\u8D77\u53C2\u4E0E\u3002",
      caption: "\u518D\u56DE\u5230\u90A3\u987F\u665A\u996D\u3002\u4F60\u60F3\u4E0D\u60F3\u7EE7\u7EED\u5403\uFF0C\u80CC\u540E\u6709\u80A0\u9053\u3001\u80F0\u817A\u548C\u5927\u8111\u4E00\u8D77\u53C2\u4E0E\u3002",
      focus: "\u9000\u56DE\u665A\u996D\u9910\u684C\uFF1B\u5668\u5B98\u534F\u540C\u56DE\u6263\u5F00\u5934\uFF0C\u4EBA\u7269\u65E0\u5FC5\u987B\u53D1\u751F\u7684\u624B\u90E8\u52A8\u4F5C\u3002",
      sourceIds: [
        "native_half_life",
        "mechanisms2018"
      ],
      start: 9133,
      end: 9328,
      duration: 195,
      startSeconds: 304.43333333333334,
      endSeconds: 310.93333333333334,
      voiceEndSeconds: 310.75333333333333,
      voiceDurationSeconds: 6.32,
      audioSHA256: "6081de26e7ad49b26888b816566e34188e1c6a54bf1e28e0a820a5ba2f87bb60",
      audio: "voice/g047.wav"
    },
    {
      id: "g048",
      section: "outro",
      text: "\u4ECE\u4E00\u53E3\u996D\u8FFD\u5230\u4E00\u4E2A\u5206\u5B50\uFF0C\u6211\u4EEC\u66F4\u61C2\u5F97\u8EAB\u4F53\u600E\u6837\u6C9F\u901A\uFF0C\u4E5F\u627E\u5230\u4E86\u5E2E\u52A9\u5B83\u7684\u65B0\u529E\u6CD5\u3002",
      caption: "\u4ECE\u4E00\u53E3\u996D\u8FFD\u5230\u4E00\u4E2A\u5206\u5B50\uFF0C\u6211\u4EEC\u66F4\u61C2\u5F97\u8EAB\u4F53\u600E\u6837\u6C9F\u901A\uFF0C\u4E5F\u627E\u5230\u4E86\u5E2E\u52A9\u5B83\u7684\u65B0\u529E\u6CD5\u3002",
      focus: "\u9910\u684C\u4E0E\u8EAB\u4F53\u901A\u4FE1\u753B\u9762\u6E29\u548C\u6536\u675F\uFF0C\u771F\u5B9E\u53C2\u8003\u8D44\u6599\u968F\u540E\u5C55\u793A\u3002",
      sourceIds: [
        "mechanisms2018",
        "lasker2024"
      ],
      start: 9328,
      end: 9506,
      duration: 178,
      startSeconds: 310.93333333333334,
      endSeconds: 316.8666666666667,
      voiceEndSeconds: 316.6933333333333,
      voiceDurationSeconds: 5.76,
      audioSHA256: "40a96833be642087487e96179474dff69f0f3f067d04f8a784e4e79f5974525b",
      audio: "voice/g048.wav"
    }
  ],
  captions: [
    {
      id: "g001-c1",
      clipId: "g001",
      text: "\u4ECA\u5E74\u8BFA\u5956\u5F00\u5956\u524D\uFF0C",
      start: 12,
      end: 71,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9
    },
    {
      id: "g001-c2",
      clipId: "g001",
      text: "\u6CD5\u65B0\u793E\u62A5\u9053\uFF0C",
      start: 79,
      end: 104,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9
    },
    {
      id: "g001-c3",
      clipId: "g001",
      text: "\u51CF\u80A5\u836F\u80CC\u540E\u7684\u80A0\u9053\u4FE1\u53F7\u7814\u7A76\uFF0C",
      start: 115,
      end: 172,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9
    },
    {
      id: "g001-c4",
      clipId: "g001",
      text: "\u662F\u533B\u5B66\u5956\u70ED\u95E8\u3002",
      start: 172,
      end: 215,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9
    },
    {
      id: "g002-c1",
      clipId: "g002",
      text: "\u5B83\u53EB\u80F0\u9AD8\u8840\u7CD6\u7D20\u6837\u80BD-1\uFF08GLP-1\uFF09\u3002",
      start: 234,
      end: 293,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8276
    },
    {
      id: "g002-c2",
      clipId: "g002",
      text: "\u4ECA\u5E74\u867D\u672A\u83B7\u5956\uFF0C",
      start: 293,
      end: 338,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8276
    },
    {
      id: "g002-c3",
      clipId: "g002",
      text: "\u5374\u5DF2\u8BA9\u6211\u4EEC\u91CD\u65B0\u7406\u89E3\u98DF\u6B32\u3002",
      start: 338,
      end: 402,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8276
    },
    {
      id: "g003-c1",
      clipId: "g003",
      text: "\u4E3A\u4EC0\u4E48\u4E00\u6761\u80A0\u9053\u4FE1\u53F7\uFF0C",
      start: 412,
      end: 456,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8889
    },
    {
      id: "g003-c2",
      clipId: "g003",
      text: "\u80FD\u5F15\u8D77\u8FD9\u4E48\u5927\u7684\u5173\u6CE8\uFF1F",
      start: 456,
      end: 501,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8889
    },
    {
      id: "g003-c3",
      clipId: "g003",
      text: "\u5148\u770B\u4E00\u987F\u666E\u901A\u7684\u665A\u996D\u3002",
      start: 501,
      end: 558,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8889
    },
    {
      id: "g004-c1",
      clipId: "g004",
      text: "\u660E\u660E\u5DF2\u7ECF\u5403\u9971\uFF0C",
      start: 576,
      end: 614,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g004-c2",
      clipId: "g004",
      text: "\u770B\u5230\u751C\u70B9\u8FD8\u662F\u60F3\u6765\u4E00\u53E3\u3002",
      start: 619,
      end: 666,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g004-c3",
      clipId: "g004",
      text: "\u809A\u5B50\u88C5\u6EE1\uFF0C",
      start: 666,
      end: 703,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g004-c4",
      clipId: "g004",
      text: "\u4E3A\u4EC0\u4E48\u5634\u8FD8\u60F3\u5403\uFF1F",
      start: 707,
      end: 740,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g005-c1",
      clipId: "g005",
      text: "\u539F\u6765\uFF0C",
      start: 759,
      end: 781,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g005-c2",
      clipId: "g005",
      text: "\u4E00\u987F\u996D\u5E26\u6765\u7684\u4E0D\u53EA\u662F\u80C3\u91CC\u7684\u98DF\u7269\uFF0C",
      start: 786,
      end: 854,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g005-c3",
      clipId: "g005",
      text: "\u8FD8\u6709\u5668\u5B98\u4E4B\u95F4\u63A5\u8FDE\u4F20\u9012\u7684\u6D88\u606F\u3002",
      start: 857,
      end: 926,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g006-c1",
      clipId: "g006",
      text: "\u73B0\u5728\u8DDF\u7740\u8FD9\u53E3\u996D\u8D70\uFF0C",
      start: 942,
      end: 984,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g006-c2",
      clipId: "g006",
      text: "\u53BB\u770B\u770B\u8FD9\u6761\u4FE1\u53F7\uFF0C",
      start: 992,
      end: 1027,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g006-c3",
      clipId: "g006",
      text: "\u600E\u6837\u5F71\u54CD\u8840\u7CD6\uFF0C",
      start: 1034,
      end: 1066,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g006-c4",
      clipId: "g006",
      text: "\u53C8\u600E\u6837\u5F71\u54CD\u98DF\u6B32\u3002",
      start: 1073,
      end: 1109,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g007-c1",
      clipId: "g007",
      text: "\u98DF\u7269\u5148\u7ECF\u8FC7\u80C3\uFF0C",
      start: 1120,
      end: 1160,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9643
    },
    {
      id: "g007-c2",
      clipId: "g007",
      text: "\u518D\u8FDB\u5165\u80A0\u9053\u3002",
      start: 1168,
      end: 1195,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9643
    },
    {
      id: "g007-c3",
      clipId: "g007",
      text: "\u8425\u517B\u5230\u6765\uFF0C",
      start: 1209,
      end: 1230,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9643
    },
    {
      id: "g007-c4",
      clipId: "g007",
      text: "\u80A0\u58C1\u91CC\u7684\u7279\u6B8A\u7EC6\u80DE\u5C31\u6709\u4E86\u53CD\u5E94\u3002",
      start: 1238,
      end: 1304,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9643
    },
    {
      id: "g008-c1",
      clipId: "g008",
      text: "\u5B83\u4EEC\u50CF\u6CBF\u8DEF\u7684\u54E8\u5175\uFF0C",
      start: 1321,
      end: 1369,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8438
    },
    {
      id: "g008-c2",
      clipId: "g008",
      text: "\u611F\u77E5\u8FDB\u98DF\u5E26\u6765\u7684\u53D8\u5316\uFF0C",
      start: 1369,
      end: 1427,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8438
    },
    {
      id: "g008-c3",
      clipId: "g008",
      text: "\u518D\u4ECE\u671D\u5411\u8EAB\u4F53\u5185\u90E8\u7684\u4E00\u4FA7\uFF0C",
      start: 1433,
      end: 1495,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8438
    },
    {
      id: "g008-c4",
      clipId: "g008",
      text: "\u91CA\u653E\u4FE1\u53F7\u3002",
      start: 1495,
      end: 1522,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8438
    },
    {
      id: "g009-c1",
      clipId: "g009",
      text: "\u8FD9\u79CD\u4FE1\u53F7\u8FDB\u5165\u5468\u56F4\u7EC4\u7EC7\u548C\u8840\u6DB2\uFF0C",
      start: 1529,
      end: 1604,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9643
    },
    {
      id: "g009-c2",
      clipId: "g009",
      text: "\u544A\u8BC9\u8EAB\u4F53\uFF1A",
      start: 1608,
      end: 1633,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9643
    },
    {
      id: "g009-c3",
      clipId: "g009",
      text: "\u996D\u5230\u4E86\uFF0C",
      start: 1639,
      end: 1657,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9643
    },
    {
      id: "g009-c4",
      clipId: "g009",
      text: "\u8BE5\u51C6\u5907\u63A5\u6536\u8425\u517B\u4E86\u3002",
      start: 1666,
      end: 1710,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9643
    },
    {
      id: "g010-c1",
      clipId: "g010",
      text: "\u79D1\u5B66\u5BB6\u65E9\u5C31\u53D1\u73B0\uFF0C",
      start: 1717,
      end: 1760,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.7429
    },
    {
      id: "g010-c2",
      clipId: "g010",
      text: "\u8840\u7CD6\u5347\u5230\u76F8\u8FD1\u6C34\u5E73\u65F6\uFF0C",
      start: 1766,
      end: 1815,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.7429
    },
    {
      id: "g010-c3",
      clipId: "g010",
      text: "\u559D\u4E0B\u7CD6\u6C34\uFF0C",
      start: 1823,
      end: 1847,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.7429
    },
    {
      id: "g010-c4",
      clipId: "g010",
      text: "\u6BD4\u4ECE\u9759\u8109\u8F93\u7CD6\u66F4\u80FD\u4FC3\u8FDB\u80F0\u5C9B\u7D20\u91CA\u653E\u3002",
      start: 1854,
      end: 1932,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.7429
    },
    {
      id: "g011-c1",
      clipId: "g011",
      text: "\u539F\u6765\uFF0C",
      start: 1950,
      end: 1967,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9231
    },
    {
      id: "g011-c2",
      clipId: "g011",
      text: "\u98DF\u7269\u7ECF\u8FC7\u80A0\u9053\u65F6\uFF0C",
      start: 1972,
      end: 2011,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9231
    },
    {
      id: "g011-c3",
      clipId: "g011",
      text: "\u591A\u53D1\u51FA\u4E86\u4E00\u6761\u6D88\u606F\uFF0C",
      start: 2018,
      end: 2058,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9231
    },
    {
      id: "g011-c4",
      clipId: "g011",
      text: "\u63D0\u524D\u7ED9\u80F0\u817A\u6253\u4E86\u62DB\u547C\u3002",
      start: 2063,
      end: 2116,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9231
    },
    {
      id: "g012-c1",
      clipId: "g012",
      text: "\u6765\u5230\u80F0\u817A\uFF0C",
      start: 2128,
      end: 2163,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8667
    },
    {
      id: "g012-c2",
      clipId: "g012",
      text: "\u91CC\u9762\u6709\u4E00\u7FA4\u8D1F\u8D23\u91CA\u653E\u80F0\u5C9B\u7D20\u7684\u7EC6\u80DE\uFF0C",
      start: 2171,
      end: 2247,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8667
    },
    {
      id: "g012-c3",
      clipId: "g012",
      text: "\u8868\u9762\u957F\u7740\u63A5\u6536\u4FE1\u53F7\u7684\u53D7\u4F53\u3002",
      start: 2253,
      end: 2310,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8667
    },
    {
      id: "g013-c1",
      clipId: "g013",
      text: "\u5C31\u50CF\u94A5\u5319\u9047\u5230\u5408\u9002\u7684\u9501\uFF0C",
      start: 2326,
      end: 2382,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9655
    },
    {
      id: "g013-c2",
      clipId: "g013",
      text: "\u5C0F\u80BD\u7ED3\u5408\u53D7\u4F53\uFF0C",
      start: 2388,
      end: 2423,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9655
    },
    {
      id: "g013-c3",
      clipId: "g013",
      text: "\u53D7\u4F53\u6539\u53D8\u5F62\u72B6\uFF0C",
      start: 2430,
      end: 2468,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9655
    },
    {
      id: "g013-c4",
      clipId: "g013",
      text: "\u628A\u6D88\u606F\u4F20\u8FDB\u7EC6\u80DE\u3002",
      start: 2473,
      end: 2511,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9655
    },
    {
      id: "g014-c1",
      clipId: "g014",
      text: "\u4E00\u4E5D\u516B\u4E03\u5E74\uFF0C",
      start: 2535,
      end: 2567,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8
    },
    {
      id: "g014-c2",
      clipId: "g014",
      text: "\u7814\u7A76\u8005\u628A\u4E0D\u540C\u957F\u5EA6\u7684\u5C0F\u80BD\uFF0C",
      start: 2575,
      end: 2629,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8
    },
    {
      id: "g014-c3",
      clipId: "g014",
      text: "\u5206\u522B\u9001\u8FDB\u79BB\u4F53\u5927\u9F20\u80F0\u817A\uFF0C",
      start: 2629,
      end: 2699,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8
    },
    {
      id: "g014-c4",
      clipId: "g014",
      text: "\u770B\u770B\u8C01\u80FD\u8D77\u6548\u3002",
      start: 2707,
      end: 2742,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8
    },
    {
      id: "g015-c1",
      clipId: "g015",
      text: "\u7ED3\u679C\uFF0C",
      start: 2752,
      end: 2771,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9032
    },
    {
      id: "g015-c2",
      clipId: "g015",
      text: "\u7279\u5B9A\u7684\u77ED\u7247\u6BB5\u4FC3\u8FDB\u4E86\u80F0\u5C9B\u7D20\u91CA\u653E\uFF1B",
      start: 2781,
      end: 2859,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9032
    },
    {
      id: "g015-c3",
      clipId: "g015",
      text: "\u7EC6\u80DE\u5B9E\u9A8C\uFF0C",
      start: 2868,
      end: 2894,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9032
    },
    {
      id: "g015-c4",
      clipId: "g015",
      text: "\u4E5F\u8FFD\u5230\u4E86\u5185\u90E8\u7684\u4F20\u4FE1\u8FC7\u7A0B\u3002",
      start: 2894,
      end: 2953,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9032
    },
    {
      id: "g016-c1",
      clipId: "g016",
      text: "\u8840\u7CD6\u8F83\u9AD8\u65F6\uFF0C",
      start: 2969,
      end: 3007,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9143
    },
    {
      id: "g016-c2",
      clipId: "g016",
      text: "\u8FD9\u6761\u6D88\u606F\u5E2E\u52A9\u88C5\u7740\u80F0\u5C9B\u7D20\u7684\u5C0F\u6CE1\u8D34\u4E0A\u7EC6\u80DE\u819C\uFF0C",
      start: 3015,
      end: 3115,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9143
    },
    {
      id: "g016-c3",
      clipId: "g016",
      text: "\u628A\u91CC\u9762\u7684\u80F0\u5C9B\u7D20\u91CA\u653E\u51FA\u53BB\u3002",
      start: 3124,
      end: 3177,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9143
    },
    {
      id: "g017-c1",
      clipId: "g017",
      text: "\u5B83\u8FD8\u4F1A\u8BA9\u50AC\u4FC3\u809D\u810F\u653E\u7CD6\u7684\u4FE1\u53F7\u51CF\u5F31\uFF0C",
      start: 3198,
      end: 3281,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9825
    },
    {
      id: "g017-c2",
      clipId: "g017",
      text: "\u809D\u810F\u4FBF\u5C11\u5F80\u8840\u6DB2\u91CC\u9001\u4E00\u4E9B\u8461\u8404\u7CD6\u3002",
      start: 3285,
      end: 3358,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9825
    },
    {
      id: "g018-c1",
      clipId: "g018",
      text: "\u4E00\u8FB9\u5E2E\u52A9\u5904\u7406\u8FDB\u6765\u7684\u7CD6\uFF0C",
      start: 3379,
      end: 3430,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g018-c2",
      clipId: "g018",
      text: "\u4E00\u8FB9\u51CF\u5C11\u989D\u5916\u653E\u7CD6\uFF0C",
      start: 3436,
      end: 3484,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g018-c3",
      clipId: "g018",
      text: "\u9910\u540E\u7684\u8840\u7CD6\u5C31\u6709\u4E86\u534F\u540C\u8C03\u8282\u3002",
      start: 3491,
      end: 3555,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g019-c1",
      clipId: "g019",
      text: "\u4F46\u8981\u7406\u89E3\u4E3A\u4EC0\u4E48\u4F1A\u5C11\u5403\uFF0C",
      start: 3574,
      end: 3629,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g019-c2",
      clipId: "g019",
      text: "\u6211\u4EEC\u8FD8\u5F97\u5F80\u4E0A\u8D70\uFF0C",
      start: 3629,
      end: 3670,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g019-c3",
      clipId: "g019",
      text: "\u53BB\u770B\u770B\u5927\u8111\u6536\u5230\u7684\u6D88\u606F\u3002",
      start: 3670,
      end: 3734,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g020-c1",
      clipId: "g020",
      text: "\u80A0\u9053\u4F1A\u901A\u8FC7\u795E\u7ECF\u7B49\u591A\u6761\u8DEF\u7EBF\uFF0C",
      start: 3750,
      end: 3824,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8824
    },
    {
      id: "g020-c2",
      clipId: "g020",
      text: "\u4E0E\u5927\u8111\u6C9F\u901A\u3002",
      start: 3824,
      end: 3857,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8824
    },
    {
      id: "g020-c3",
      clipId: "g020",
      text: "\u9965\u997F\u548C\u9971\u8179\uFF0C",
      start: 3867,
      end: 3901,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8824
    },
    {
      id: "g020-c4",
      clipId: "g020",
      text: "\u5E76\u975E\u53EA\u7531\u80C3\u91CC\u88C5\u4E86\u591A\u5C11\u51B3\u5B9A\u3002",
      start: 3901,
      end: 3974,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8824
    },
    {
      id: "g021-c1",
      clipId: "g021",
      text: "\u76F8\u5173\u836F\u7269\u80FD\u6301\u7EED\u6FC0\u6D3B\u8FD9\u79CD\u53D7\u4F53\uFF0C",
      start: 3981,
      end: 4049,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9655
    },
    {
      id: "g021-c2",
      clipId: "g021",
      text: "\u8BA9\u98DF\u6B32\u51CF\u8F7B\uFF0C",
      start: 4049,
      end: 4088,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9655
    },
    {
      id: "g021-c3",
      clipId: "g021",
      text: "\u66F4\u5BB9\u6613\u89C9\u5F97\u591F\u4E86\uFF0C",
      start: 4088,
      end: 4127,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9655
    },
    {
      id: "g021-c4",
      clipId: "g021",
      text: "\u5C11\u5403\u4E00\u4E9B\u3002",
      start: 4127,
      end: 4153,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9655
    },
    {
      id: "g022-c1",
      clipId: "g022",
      text: "\u5B83\u4EEC\u4E5F\u4F1A\u8BA9\u80C3\u6392\u7A7A\u53D8\u6162\u3002",
      start: 4171,
      end: 4238,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.931
    },
    {
      id: "g022-c2",
      clipId: "g022",
      text: "\u4E0D\u8FC7\uFF0C",
      start: 4247,
      end: 4255,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.931
    },
    {
      id: "g022-c3",
      clipId: "g022",
      text: "\u6301\u7EED\u6CBB\u7597\u4E2D\u7684\u51CF\u91CD\uFF0C",
      start: 4255,
      end: 4311,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.931
    },
    {
      id: "g022-c4",
      clipId: "g022",
      text: "\u8FD8\u79BB\u4E0D\u5F00\u98DF\u6B32\u7684\u6539\u53D8\u3002",
      start: 4311,
      end: 4367,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.931
    },
    {
      id: "g023-c1",
      clipId: "g023",
      text: "\u5403\u8FDB\u53BB\u7684\u80FD\u91CF\u51CF\u5C11\u4E86\uFF0C",
      start: 4376,
      end: 4429,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g023-c2",
      clipId: "g023",
      text: "\u4F53\u91CD\u624D\u5728\u968F\u540E\u6570\u5468\u3001\u6570\u6708\u91CC\u6539\u53D8\uFF0C",
      start: 4435,
      end: 4521,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g023-c3",
      clipId: "g023",
      text: "\u8102\u80AA\u5E76\u4E0D\u4F1A\u77AC\u95F4\u6D88\u5931\u3002",
      start: 4530,
      end: 4581,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g024-c1",
      clipId: "g024",
      text: "\u6240\u4EE5\uFF0C",
      start: 4596,
      end: 4619,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g024-c2",
      clipId: "g024",
      text: "\u5403\u591A\u5403\u5C11\u8FD8\u53D7\u5230\u8EAB\u4F53\u4FE1\u53F7\u7684\u5F71\u54CD\uFF0C",
      start: 4628,
      end: 4710,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g024-c3",
      clipId: "g024",
      text: "\u80A5\u80D6\u4E0D\u80FD\u7B80\u5355\u5F52\u7ED3\u4E3A\u4E0D\u591F\u81EA\u5F8B\u3002",
      start: 4717,
      end: 4787,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g025-c1",
      clipId: "g025",
      text: "\u53EF\u5929\u7136\u4FE1\u53F7\u6709\u4E2A\u96BE\u9898\uFF1A",
      start: 4804,
      end: 4864,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g025-c2",
      clipId: "g025",
      text: "\u8FDB\u5165\u8840\u6DB2\u540E\uFF0C",
      start: 4872,
      end: 4899,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g025-c3",
      clipId: "g025",
      text: "\u6D3B\u6027\u5927\u7EA6\u4E00\u4E24\u5206\u949F\u5C31\u51CF\u5C11\u4E00\u534A\u3002",
      start: 4908,
      end: 4975,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g026-c1",
      clipId: "g026",
      text: "\u8EAB\u4F53\u91CC\u6709\u4E00\u628A\u5206\u5B50\u526A\u5200\uFF0C",
      start: 4995,
      end: 5053,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9677
    },
    {
      id: "g026-c2",
      clipId: "g026",
      text: "\u4F1A\u526A\u6389\u5B83\u5F00\u5934\u7684\u4E00\u5C0F\u6BB5\uFF0C",
      start: 5060,
      end: 5109,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9677
    },
    {
      id: "g026-c3",
      clipId: "g026",
      text: "\u8BA9\u5B83\u5F88\u5FEB\u5931\u53BB\u539F\u6765\u7684\u6D3B\u6027\u3002",
      start: 5116,
      end: 5177,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9677
    },
    {
      id: "g027-c1",
      clipId: "g027",
      text: "\u60F3\u628A\u8FD9\u79CD\u4FE1\u53F7\u505A\u6210\u836F\uFF0C",
      start: 5192,
      end: 5244,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g027-c2",
      clipId: "g027",
      text: "\u5C31\u5F97\u8BA9\u5B83\u4FDD\u7559\u4F5C\u7528\uFF0C",
      start: 5248,
      end: 5289,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g027-c3",
      clipId: "g027",
      text: "\u540C\u65F6\u5728\u8EAB\u4F53\u91CC\u591A\u5F85\u4E00\u4F1A\u513F\u3002",
      start: 5295,
      end: 5348,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g028-c1",
      clipId: "g028",
      text: "\u4EE5\u53F8\u7F8E\u683C\u9C81\u80BD\u4E3A\u4F8B\uFF0C",
      start: 5352,
      end: 5408,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9375
    },
    {
      id: "g028-c2",
      clipId: "g028",
      text: "\u7814\u7A76\u8005\u6362\u6389\u4E00\u4E2A\u5BB9\u6613\u88AB\u526A\u7684\u4F4D\u7F6E\uFF0C",
      start: 5416,
      end: 5489,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9375
    },
    {
      id: "g028-c3",
      clipId: "g028",
      text: "\u8BA9\u5206\u5B50\u526A\u5200\u4E0D\u5BB9\u6613\u4E0B\u624B\u3002",
      start: 5492,
      end: 5543,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9375
    },
    {
      id: "g029-c1",
      clipId: "g029",
      text: "\u518D\u7ED9\u5B83\u63A5\u4E0A\u4E00\u6761\u4FA7\u94FE\uFF0C",
      start: 5560,
      end: 5609,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9677
    },
    {
      id: "g029-c2",
      clipId: "g029",
      text: "\u8BA9\u5B83\u80FD\u6682\u65F6\u642D\u4E0A\u8840\u6DB2\u4E2D\u7684\u767D\u86CB\u767D\uFF0C",
      start: 5618,
      end: 5691,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9677
    },
    {
      id: "g029-c3",
      clipId: "g029",
      text: "\u51CF\u6162\u88AB\u6E05\u9664\u7684\u901F\u5EA6\u3002",
      start: 5698,
      end: 5741,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9677
    },
    {
      id: "g030-c1",
      clipId: "g030",
      text: "\u8FD9\u4E9B\u6539\u9020\uFF0C",
      start: 5755,
      end: 5783,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9259
    },
    {
      id: "g030-c2",
      clipId: "g030",
      text: "\u628A\u5B83\u7684\u534A\u8870\u671F\u5EF6\u957F\u5230\u7EA6\u4E00\u5468\uFF0C",
      start: 5790,
      end: 5850,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9259
    },
    {
      id: "g030-c3",
      clipId: "g030",
      text: "\u652F\u6301\u6BCF\u5468\u4E00\u6B21\u7684\u76AE\u4E0B\u6CE8\u5C04\u3002",
      start: 5858,
      end: 5909,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9259
    },
    {
      id: "g031-c1",
      clipId: "g031",
      text: "\u8FD8\u6709\u836F\u7269\u4F1A\u540C\u65F6\u542F\u52A8\u4E24\u79CD\u53D7\u4F53\uFF0C",
      start: 5919,
      end: 5992,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8235
    },
    {
      id: "g031-c2",
      clipId: "g031",
      text: "\u6BD4\u5982\u66FF\u5C14\u6CCA\u80BD\u3002",
      start: 5992,
      end: 6041,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8235
    },
    {
      id: "g031-c3",
      clipId: "g031",
      text: "\u5B83\u4E0E\u53F8\u7F8E\u683C\u9C81\u80BD\uFF0C",
      start: 6052,
      end: 6084,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8235
    },
    {
      id: "g031-c4",
      clipId: "g031",
      text: "\u4E0D\u80FD\u5F53\u6210\u540C\u4E00\u79CD\u836F\u3002",
      start: 6084,
      end: 6134,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8235
    },
    {
      id: "g032-c1",
      clipId: "g032",
      text: "\u5206\u5B50\u8BBE\u8BA1\u5F97\u5DE7\uFF0C",
      start: 6152,
      end: 6189,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9643
    },
    {
      id: "g032-c2",
      clipId: "g032",
      text: "\u5230\u4E86\u4EBA\u8EAB\u4E0A\u7A76\u7ADF\u6709\u6CA1\u6709\u7528\uFF1F",
      start: 6195,
      end: 6250,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9643
    },
    {
      id: "g032-c3",
      clipId: "g032",
      text: "\u8FD9\u5C31\u8981\u8BF7\u4E34\u5E8A\u8BD5\u9A8C\u6765\u56DE\u7B54\u3002",
      start: 6258,
      end: 6316,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9643
    },
    {
      id: "g033-c1",
      clipId: "g033",
      text: "\u4E00\u9879\u7814\u7A76\u627E\u6765\u7EA6\u4E24\u5343\u540D",
      start: 6323,
      end: 6389,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g033-c2",
      clipId: "g033",
      text: "\u6CA1\u6709\u7CD6\u5C3F\u75C5\u3001\u7B26\u5408\u8D85\u91CD\u6216\u80A5\u80D6\u6761\u4EF6\u7684\u6210\u5E74\u4EBA\uFF0C",
      start: 6394,
      end: 6498,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g033-c3",
      clipId: "g033",
      text: "\u968F\u673A\u5206\u7EC4\u3002",
      start: 6498,
      end: 6529,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g034-c1",
      clipId: "g034",
      text: "\u4E24\u7EC4\u90FD\u5F97\u5230\u996E\u98DF\u548C\u8FD0\u52A8\u6307\u5BFC\uFF0C",
      start: 6547,
      end: 6618,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.871
    },
    {
      id: "g034-c2",
      clipId: "g034",
      text: "\u4E00\u7EC4\u6BCF\u5468\u6CE8\u5C04\u53F8\u7F8E\u683C\u9C81\u80BD\uFF0C",
      start: 6621,
      end: 6683,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.871
    },
    {
      id: "g034-c3",
      clipId: "g034",
      text: "\u53E6\u4E00\u7EC4\u6CE8\u5C04\u5B89\u6170\u5242\u3002",
      start: 6689,
      end: 6732,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.871
    },
    {
      id: "g035-c1",
      clipId: "g035",
      text: "\u516D\u5341\u516B\u5468\u540E\uFF0C",
      start: 6749,
      end: 6787,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8462
    },
    {
      id: "g035-c2",
      clipId: "g035",
      text: "\u836F\u7269\u7EC4\u5E73\u5747\u51CF\u91CD\u767E\u5206\u4E4B\u5341\u56DB\u70B9\u4E5D\uFF0C",
      start: 6795,
      end: 6865,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8462
    },
    {
      id: "g035-c3",
      clipId: "g035",
      text: "\u5B89\u6170\u5242\u7EC4\u662F\u767E\u5206\u4E4B\u4E8C\u70B9\u56DB\u3002",
      start: 6869,
      end: 6926,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8462
    },
    {
      id: "g036-c1",
      clipId: "g036",
      text: "\u8FD9\u662F\u4E24\u7EC4\u4EBA\u7684\u5E73\u5747\u503C\uFF0C",
      start: 6944,
      end: 6994,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8966
    },
    {
      id: "g036-c2",
      clipId: "g036",
      text: "\u6709\u4EBA\u51CF\u5F97\u591A\uFF0C",
      start: 6994,
      end: 7027,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8966
    },
    {
      id: "g036-c3",
      clipId: "g036",
      text: "\u6709\u4EBA\u51CF\u5F97\u5C11\uFF0C",
      start: 7027,
      end: 7059,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8966
    },
    {
      id: "g036-c4",
      clipId: "g036",
      text: "\u4E0D\u80FD\u5F53\u4F5C\u6BCF\u4E2A\u4EBA\u7684\u4FDD\u8BC1\u3002",
      start: 7059,
      end: 7114,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8966
    },
    {
      id: "g037-c1",
      clipId: "g037",
      text: "\u53E6\u4E00\u9879\u8BD5\u9A8C\uFF0C",
      start: 7132,
      end: 7164,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g037-c2",
      clipId: "g037",
      text: "\u5173\u6CE8\u5DF2\u6709\u5FC3\u8840\u7BA1\u75C5\u3001\u8D85\u91CD\u6216\u80A5\u80D6\uFF0C",
      start: 7168,
      end: 7255,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g037-c3",
      clipId: "g037",
      text: "\u540C\u65F6\u6CA1\u6709\u7CD6\u5C3F\u75C5\u7684\u4EBA\u3002",
      start: 7265,
      end: 7305,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g038-c1",
      clipId: "g038",
      text: "\u5E73\u5747\u968F\u8BBF\u7EA6\u56DB\u5341\u4E2A\u6708\uFF0C",
      start: 7320,
      end: 7373,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8696
    },
    {
      id: "g038-c2",
      clipId: "g038",
      text: "\u4E3B\u8981\u5FC3\u8840\u7BA1\u4E8B\u4EF6\u53D1\u751F\u7387\uFF0C",
      start: 7381,
      end: 7429,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8696
    },
    {
      id: "g038-c3",
      clipId: "g038",
      text: "\u836F\u7269\u7EC4\u4E3A\u767E\u5206\u4E4B\u516D\u70B9\u4E94\uFF0C",
      start: 7437,
      end: 7482,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8696
    },
    {
      id: "g038-c4",
      clipId: "g038",
      text: "\u5B89\u6170\u5242\u7EC4\u4E3A\u767E\u5206\u4E4B\u516B\u3002",
      start: 7489,
      end: 7530,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8696
    },
    {
      id: "g039-c1",
      clipId: "g039",
      text: "\u76F8\u5F53\u4E8E\u6BCF\u4E00\u767E\u4EBA\uFF0C",
      start: 7553,
      end: 7600,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8814
    },
    {
      id: "g039-c2",
      clipId: "g039",
      text: "\u836F\u7269\u7EC4\u5C11\u7EA6\u4E00\u70B9\u4E94\u4EBA\u53D1\u751F\u8FD9\u7C7B\u4E8B\u4EF6\uFF0C",
      start: 7609,
      end: 7699,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8814
    },
    {
      id: "g039-c3",
      clipId: "g039",
      text: "\u83B7\u76CA\u5C31\u66F4\u6709\u5C3A\u5EA6\u4E86\u3002",
      start: 7706,
      end: 7753,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.8814
    },
    {
      id: "g040-c1",
      clipId: "g040",
      text: "\u4F46\u836F\u7269\u4E5F\u4F1A\u5E26\u6765\u6076\u5FC3\u3001\u5455\u5410\u3001\u8179\u6CFB\u7B49\u4E0D\u9002\uFF0C",
      start: 7770,
      end: 7880,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g040-c2",
      clipId: "g040",
      text: "\u6709\u4E9B\u4EBA\u4F1A\u56E0\u6B64\u505C\u6B62\u6CBB\u7597\u3002",
      start: 7885,
      end: 7936,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g041-c1",
      clipId: "g041",
      text: "\u800C\u5728\u4E00\u9879\u5EF6\u4F38\u7814\u7A76\u91CC\uFF0C",
      start: 7953,
      end: 8e3,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9375
    },
    {
      id: "g041-c2",
      clipId: "g041",
      text: "\u505C\u836F\u5E76\u7ED3\u675F\u8BD5\u9A8C\u7684\u996E\u98DF\u8FD0\u52A8\u6307\u5BFC\u4E00\u5E74\u540E\uFF0C",
      start: 8006,
      end: 8093,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9375
    },
    {
      id: "g041-c3",
      clipId: "g041",
      text: "\u4F53\u91CD\u660E\u663E\u56DE\u5347\u3002",
      start: 8099,
      end: 8131,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9375
    },
    {
      id: "g042-c1",
      clipId: "g042",
      text: "\u539F\u836F\u7269\u7EC4\u5E73\u5747\u957F\u56DE\u4E86\u6B64\u524D\u51CF\u6389\u4F53\u91CD\u7684\u7EA6\u4E09\u5206\u4E4B\u4E8C\uFF0C",
      start: 8148,
      end: 8266,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.931
    },
    {
      id: "g042-c2",
      clipId: "g042",
      text: "\u4ECD\u672A\u5B8C\u5168\u56DE\u5230\u8D77\u70B9\u3002",
      start: 8266,
      end: 8320,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.931
    },
    {
      id: "g043-c1",
      clipId: "g043",
      text: "\u8FD9\u63D0\u9192\u6211\u4EEC\uFF0C",
      start: 8331,
      end: 8362,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9355
    },
    {
      id: "g043-c2",
      clipId: "g043",
      text: "\u6CBB\u7597\u4E0D\u662F\u628A\u8EAB\u4F53\u7684\u5F00\u5173\u6C38\u4E45\u62E8\u597D\uFF0C",
      start: 8374,
      end: 8444,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9355
    },
    {
      id: "g043-c3",
      clipId: "g043",
      text: "\u540E\u7EED\u7684\u4F53\u91CD\u548C\u5065\u5EB7\u4ECD\u9700\u7BA1\u7406\u3002",
      start: 8450,
      end: 8523,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9355
    },
    {
      id: "g044-c1",
      clipId: "g044",
      text: "\u600E\u4E48\u5403\uFF0C",
      start: 8538,
      end: 8565,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g044-c2",
      clipId: "g044",
      text: "\u600E\u6837\u6D3B\u52A8\uFF0C",
      start: 8572,
      end: 8593,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g044-c3",
      clipId: "g044",
      text: "\u6CBB\u7597\u80FD\u5426\u8010\u53D7\uFF0C",
      start: 8602,
      end: 8635,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g044-c4",
      clipId: "g044",
      text: "\u90FD\u9700\u8981\u653E\u8FDB\u9002\u5408\u81EA\u5DF1\u7684\u957F\u671F\u65B9\u6848\u91CC\u3002",
      start: 8644,
      end: 8715,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g045-c1",
      clipId: "g045",
      text: "\u56DE\u770B\u8FD9\u6BB5\u53D1\u73B0\uFF1A",
      start: 8731,
      end: 8769,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9394
    },
    {
      id: "g045-c2",
      clipId: "g045",
      text: "\u5148\u627E\u5230\u80A0\u9053\u53D1\u51FA\u7684\u6D88\u606F\uFF0C",
      start: 8779,
      end: 8835,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9394
    },
    {
      id: "g045-c3",
      clipId: "g045",
      text: "\u518D\u8BA9\u5B83\u591A\u7559\u4E00\u4F1A\u513F\uFF0C",
      start: 8840,
      end: 8880,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9394
    },
    {
      id: "g045-c4",
      clipId: "g045",
      text: "\u6700\u540E\u7528\u8BD5\u9A8C\u68C0\u9A8C\u6548\u679C\u3002",
      start: 8880,
      end: 8930,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9394
    },
    {
      id: "g046-c1",
      clipId: "g046",
      text: "\u5C0F\u5C0F\u7684\u4FE1\u53F7\uFF0C",
      start: 8951,
      end: 8984,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g046-c2",
      clipId: "g046",
      text: "\u7ECF\u8FC7\u51E0\u5341\u5E74\u7684\u7814\u7A76\uFF0C",
      start: 8984,
      end: 9031,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g046-c3",
      clipId: "g046",
      text: "\u624D\u8D70\u51FA\u5B9E\u9A8C\u5BA4\uFF0C",
      start: 9034,
      end: 9070,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g046-c4",
      clipId: "g046",
      text: "\u6210\u4E3A\u533B\u751F\u624B\u91CC\u7684\u6CBB\u7597\u5DE5\u5177\u3002",
      start: 9077,
      end: 9128,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 1
    },
    {
      id: "g047-c1",
      clipId: "g047",
      text: "\u518D\u56DE\u5230\u90A3\u987F\u665A\u996D\u3002",
      start: 9133,
      end: 9181,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9286
    },
    {
      id: "g047-c2",
      clipId: "g047",
      text: "\u4F60\u60F3\u4E0D\u60F3\u7EE7\u7EED\u5403\uFF0C",
      start: 9181,
      end: 9216,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9286
    },
    {
      id: "g047-c3",
      clipId: "g047",
      text: "\u80CC\u540E\u6709\u80A0\u9053\u3001\u80F0\u817A\u548C\u5927\u8111\u4E00\u8D77\u53C2\u4E0E\u3002",
      start: 9216,
      end: 9311,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9286
    },
    {
      id: "g048-c1",
      clipId: "g048",
      text: "\u4ECE\u4E00\u53E3\u996D\u8FFD\u5230\u4E00\u4E2A\u5206\u5B50\uFF0C",
      start: 9329,
      end: 9383,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9688
    },
    {
      id: "g048-c2",
      clipId: "g048",
      text: "\u6211\u4EEC\u66F4\u61C2\u5F97\u8EAB\u4F53\u600E\u6837\u6C9F\u901A\uFF0C",
      start: 9383,
      end: 9444,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9688
    },
    {
      id: "g048-c3",
      clipId: "g048",
      text: "\u4E5F\u627E\u5230\u4E86\u5E2E\u52A9\u5B83\u7684\u65B0\u529E\u6CD5\u3002",
      start: 9444,
      end: 9501,
      timingSource: "CPU Whisper word alignment with original display text",
      alignmentRatio: 0.9688
    }
  ],
  sections: [
    {
      id: "news",
      start: 12,
      end: 412
    },
    {
      id: "meal",
      start: 412,
      end: 1120
    },
    {
      id: "gut",
      start: 1120,
      end: 2126
    },
    {
      id: "pancreas",
      start: 2126,
      end: 3574
    },
    {
      id: "brain",
      start: 3574,
      end: 4802
    },
    {
      id: "drug",
      start: 4802,
      end: 6152
    },
    {
      id: "trial",
      start: 6152,
      end: 8331
    },
    {
      id: "daily",
      start: 8331,
      end: 9133
    },
    {
      id: "outro",
      start: 9133,
      end: 9506
    },
    {
      id: "references",
      start: 9506,
      end: 9776
    }
  ],
  draft: false,
  voiceSpeedFactor: 1,
  outro: {
    start: 9506,
    end: 9776,
    duration: 270
  }
};

// src/Research.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var quiet = "#647978";
var stroke = "#afc1ba";
var WIDTH = 610;
var HEIGHT = 445;
function Text({ x = 0, y, children, size = 36, color = C.ink, strong = false }) {
  return /* @__PURE__ */ jsx(
    "text",
    {
      x,
      y,
      fill: color,
      fontSize: size,
      fontWeight: strong ? 650 : 500,
      dominantBaseline: "alphabetic",
      children
    }
  );
}
function Flow({ x1, x2, y, time, color = C.teal, active = 1 }) {
  return /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("path", { d: `M ${x1} ${y} H ${x2}`, stroke, strokeWidth: 3, fill: "none" }),
    /* @__PURE__ */ jsx(
      "path",
      {
        d: `M ${x2 - 10} ${y - 6} L ${x2} ${y} L ${x2 - 10} ${y + 6}`,
        stroke,
        strokeWidth: 3,
        fill: "none",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }
    ),
    [0, 0.5].map((offset, i) => {
      const u = ((time * 0.35 + offset) % 1 + 1) % 1;
      return /* @__PURE__ */ jsx(
        "circle",
        {
          cx: x1 + (x2 - x1 - 10) * u,
          cy: y,
          r: 5,
          fill: color,
          opacity: active * smooth(u / 0.15) * smooth((1 - u) / 0.15)
        },
        i
      );
    })
  ] });
}
function OralComparison({ time, progress }) {
  const result = smooth((progress - 0.25) / 0.25);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Text, { y: 48, size: 46, strong: true, children: "\u5148\u8BA9\u8840\u7CD6\u6C34\u5E73\u76F8\u8FD1" }),
    /* @__PURE__ */ jsx(Text, { y: 148, children: "\u559D\u7CD6\u6C34" }),
    /* @__PURE__ */ jsx(Text, { y: 256, children: "\u9759\u8109\u8F93\u7CD6" }),
    /* @__PURE__ */ jsx(Flow, { x1: 190, x2: 372, y: 136, time }),
    /* @__PURE__ */ jsx(Flow, { x1: 190, x2: 372, y: 244, time }),
    /* @__PURE__ */ jsx(
      "path",
      {
        d: "M 397 118 H 407 V 264 H 397",
        fill: "none",
        stroke,
        strokeWidth: 3,
        strokeLinecap: "round"
      }
    ),
    /* @__PURE__ */ jsx(Text, { x: 434, y: 178, children: "\u6D4B\u91CF" }),
    /* @__PURE__ */ jsx(Text, { x: 434, y: 226, children: "\u80F0\u5C9B\u7D20" }),
    /* @__PURE__ */ jsx("g", { transform: `translate(${-22 * (1 - result)} 0)`, opacity: result, children: /* @__PURE__ */ jsx(Text, { y: 349, size: 56, strong: true, color: C.teal, children: "\u53E3\u670D\uFF0C\u53CD\u5E94\u66F4\u5F3A" }) }),
    /* @__PURE__ */ jsx(Text, { y: 425, color: quiet, children: "Nauck \u7B49 \xB7 1986" })
  ] });
}
function Peptide({ first, y, reveal, color }) {
  const x = (residue) => 18 + (residue - 1) * 14.65;
  return /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx(
      "path",
      {
        d: `M ${x(first)} ${y} H ${x(37)}`,
        stroke: color,
        strokeWidth: 2.2,
        opacity: 0.42,
        pathLength: 1,
        strokeDasharray: "1",
        strokeDashoffset: 1 - reveal
      }
    ),
    Array.from({ length: 38 - first }, (_, i) => first + i).map((residue, i) => {
      const visible = smooth((reveal * (39 - first) - i) / 2);
      return /* @__PURE__ */ jsx(
        "circle",
        {
          cx: x(residue),
          cy: y,
          r: 5.5 * visible,
          fill: color
        },
        residue
      );
    })
  ] });
}
function ActiveFragment({ progress }) {
  const long = smooth((progress - 0.04) / 0.2);
  const short = smooth((progress - 0.3) / 0.2);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Text, { y: 43, size: 46, strong: true, children: "\u79BB\u4F53\u5927\u9F20\u80F0\u817A" }),
    /* @__PURE__ */ jsx(Text, { y: 96, color: quiet, children: "\u76F8\u540C\u8461\u8404\u7CD6\uFF1A6.6 mM" }),
    /* @__PURE__ */ jsx(Text, { y: 167, children: "\u957F\u7247\u6BB5 \xB7 37 \u6B8B\u57FA" }),
    /* @__PURE__ */ jsx(Peptide, { first: 1, y: 198, reveal: long, color: quiet }),
    /* @__PURE__ */ jsx(Text, { y: 250, color: quiet, children: "\u672A\u89C1\u4FC3\u5206\u6CCC\u4F5C\u7528" }),
    /* @__PURE__ */ jsx(Text, { y: 312, children: "\u77ED\u7247\u6BB5 \xB7 31 \u6B8B\u57FA" }),
    /* @__PURE__ */ jsx(Peptide, { first: 7, y: 343, reveal: short, color: C.teal }),
    /* @__PURE__ */ jsx("g", { opacity: short, transform: `translate(${18 * (1 - short)} 0)`, children: /* @__PURE__ */ jsx(Text, { x: 346, y: 312, color: C.teal, strong: true, children: "\u91CA\u653E\u589E\u5F3A" }) }),
    /* @__PURE__ */ jsx(Text, { y: 425, color: quiet, children: "Mojsov \u7B49 \xB7 1987" })
  ] });
}
function CultureCell({ time, progress }) {
  const reveal = smooth((progress - 0.12) / 0.6);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Text, { y: 43, size: 46, strong: true, children: "\u57F9\u517B\u5927\u9F20\u7EC6\u80DE" }),
    /* @__PURE__ */ jsx(Text, { y: 98, color: quiet, children: "\u52A0\u5165\u6709\u6D3B\u6027\u7684\u77ED\u7247\u6BB5" }),
    /* @__PURE__ */ jsx(
      "path",
      {
        d: "M 25 158 V 330",
        stroke,
        strokeWidth: 3,
        fill: "none",
        pathLength: 1,
        strokeDasharray: "1",
        strokeDashoffset: 1 - reveal
      }
    ),
    [175, 252, 329].map((y, i) => {
      const enter = smooth((reveal * 4 - i) / 1.5);
      return /* @__PURE__ */ jsxs("g", { transform: `translate(${20 * (1 - enter)} 0)`, opacity: enter, children: [
        /* @__PURE__ */ jsx("circle", { cx: 25, cy: y - 12, r: 7, fill: C.teal }),
        /* @__PURE__ */ jsx(
          "circle",
          {
            cx: 25,
            cy: y - 12,
            r: 13 + 2 * Math.sin(time * 1.5 - i),
            fill: "none",
            stroke: C.teal,
            strokeOpacity: 0.18,
            strokeWidth: 2
          }
        ),
        /* @__PURE__ */ jsx(
          Text,
          {
            x: 64,
            y,
            color: i === 2 ? C.teal : C.ink,
            size: i === 2 ? 46 : 36,
            strong: i === 2,
            children: ["\u4F20\u4FE1\u5206\u5B50 cAMP \u2191", "\u80F0\u5C9B\u7D20\u6307\u4EE4 mRNA \u2191", "\u80F0\u5C9B\u7D20\u91CA\u653E \u2191"][i]
          }
        )
      ] }, i);
    }),
    /* @__PURE__ */ jsx(Text, { y: 425, color: quiet, children: "Drucker \u7B49 \xB7 1987" })
  ] });
}
function ReceptorGlyph({ x, y, blocked, time }) {
  return /* @__PURE__ */ jsxs("g", { transform: `translate(${x} ${y})`, children: [
    /* @__PURE__ */ jsx("path", { d: "M -35 33 H 35 M -35 45 H 35", stroke, strokeWidth: 3 }),
    /* @__PURE__ */ jsx(
      "path",
      {
        d: "M -15 -6 Q -15 13 0 17 Q 15 13 15 -6 M 0 17 V 58",
        fill: "none",
        stroke: blocked ? quiet : C.teal,
        strokeWidth: 7,
        strokeLinecap: "round"
      }
    ),
    blocked ? /* @__PURE__ */ jsx(
      "path",
      {
        d: "M -15 -3 L 0 -13 L 15 -3 L 0 7 Z",
        fill: C.rose,
        stroke: C.red,
        strokeWidth: 2
      }
    ) : /* @__PURE__ */ jsx(
      "circle",
      {
        cx: 0,
        cy: -12 + 2 * Math.sin(time * 1.7),
        r: 8,
        fill: C.teal
      }
    )
  ] });
}
function AnimalBrain({ time, progress }) {
  const blocked = smooth((progress - 0.43) / 0.18);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Text, { y: 43, size: 46, strong: true, children: "\u5927\u9F20\u8111\u5185\u5B9E\u9A8C" }),
    /* @__PURE__ */ jsx(Text, { y: 118, children: "\u8111\u5BA4\u7ED9 GLP-1" }),
    /* @__PURE__ */ jsx(Flow, { x1: 18, x2: 179, y: 164, time }),
    /* @__PURE__ */ jsx(ReceptorGlyph, { x: 250, y: 123, blocked: false, time }),
    /* @__PURE__ */ jsx(Text, { x: 358, y: 173, color: C.teal, strong: true, children: "\u8FDB\u98DF\u51CF\u5C11" }),
    /* @__PURE__ */ jsxs("g", { transform: `translate(${-20 * (1 - blocked)} 0)`, opacity: blocked, children: [
      /* @__PURE__ */ jsx(Text, { y: 278, children: "\u5148\u963B\u65AD\u53D7\u4F53" }),
      /* @__PURE__ */ jsx(Flow, { x1: 18, x2: 179, y: 324, time, color: quiet, active: 0.38 }),
      /* @__PURE__ */ jsx(ReceptorGlyph, { x: 250, y: 283, blocked: true, time }),
      /* @__PURE__ */ jsx(Text, { x: 358, y: 333, color: quiet, children: "\u6548\u5E94\u88AB\u963B\u65AD" })
    ] }),
    /* @__PURE__ */ jsx(Text, { y: 425, color: quiet, children: "Turton \u7B49 \xB7 1996" })
  ] });
}
function HumanAppetite({ time, progress }) {
  const result = smooth((progress - 0.28) / 0.3);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Text, { y: 43, size: 46, strong: true, children: "\u80A5\u80D6\u6210\u4EBA \xB7 20 \u5468\u7814\u7A76" }),
    /* @__PURE__ */ jsxs("g", { transform: `translate(120 183) scale(.8) rotate(${2 * Math.sin(time * 0.35)})`, children: [
      /* @__PURE__ */ jsx("ellipse", { rx: 91, ry: 66, fill: C.paper, stroke, strokeWidth: 3 }),
      /* @__PURE__ */ jsx("ellipse", { rx: 67, ry: 46, fill: "none", stroke, strokeWidth: 2 }),
      /* @__PURE__ */ jsx(
        "path",
        {
          d: "M -118 -54 V 43 M -128 -54 V -22 Q -118 -8 -108 -22 V -54",
          fill: "none",
          stroke: C.teal,
          strokeWidth: 3,
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx(
        "path",
        {
          d: "M 118 -55 Q 131 -31 118 -7 V 44",
          fill: "none",
          stroke: C.teal,
          strokeWidth: 3,
          strokeLinecap: "round"
        }
      )
    ] }),
    /* @__PURE__ */ jsx(Text, { x: 275, y: 166, children: "\u6D4B\u91CF\u4E00\u987F\u996D" }),
    /* @__PURE__ */ jsx(Text, { x: 275, y: 215, children: "\u771F\u6B63\u5403\u4E0B\u591A\u5C11" }),
    /* @__PURE__ */ jsx("g", { opacity: result, transform: `translate(${18 * (1 - result)} 0)`, children: /* @__PURE__ */ jsx(Text, { y: 333, size: 46, color: C.teal, strong: true, children: "\u9965\u997F\u611F \u2193  \u8FDB\u98DF\u91CF \u2193" }) }),
    /* @__PURE__ */ jsx(Text, { y: 425, color: quiet, children: "Friedrichsen \u7B49 \xB7 2021" })
  ] });
}
function Research({ s }) {
  const n = Number(s.clip.id.slice(1));
  if (![10, 14, 15, 20, 21].includes(n)) return null;
  const time = (s.frame - s.clip.start) / timeline_default.fps;
  const remaining = (s.clip.end - s.frame) / timeline_default.fps;
  const enter = smooth(time / 0.72);
  const exit = smooth((0.72 - remaining) / 0.72);
  const x = -WIDTH * (1 - enter) - WIDTH * exit;
  const props = { time, progress: clamp(s.clipProgress) };
  return /* @__PURE__ */ jsx("div", { style: {
    position: "absolute",
    left: 90,
    top: 440,
    width: WIDTH,
    height: HEIGHT,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: 11,
    fontFamily: TYPOGRAPHY.family
  }, children: /* @__PURE__ */ jsx(
    "svg",
    {
      width: WIDTH,
      height: HEIGHT,
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      style: { display: "block", overflow: "hidden" },
      children: /* @__PURE__ */ jsxs("g", { transform: `translate(${x} 0)`, fontFamily: TYPOGRAPHY.family, children: [
        n === 10 && /* @__PURE__ */ jsx(OralComparison, { ...props }),
        n === 14 && /* @__PURE__ */ jsx(ActiveFragment, { ...props }),
        n === 15 && /* @__PURE__ */ jsx(CultureCell, { ...props }),
        n === 20 && /* @__PURE__ */ jsx(AnimalBrain, { ...props }),
        n === 21 && /* @__PURE__ */ jsx(HumanAppetite, { ...props })
      ] })
    }
  ) });
}
export {
  Research
};
