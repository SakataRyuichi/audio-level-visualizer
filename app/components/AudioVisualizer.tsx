"use client";

import React, { useState, useEffect, useRef } from 'react';

const AudioVisualizer = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [decibel, setDecibel] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const dataArrayRef = useRef(null);
  
  // マイクへのアクセスを開始
  const startRecording = async () => {
    try {
      // 既存のオーディオコンテキストをリセット
      if (audioContextRef.current) {
        await audioContextRef.current.close();
      }
      
      // オーディオコンテキストの作成
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      // マイクからの音声ストリームを取得
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      microphoneStreamRef.current = stream;
      
      // オーディオソースを作成
      const microphone = audioContextRef.current.createMediaStreamSource(stream);
      
      // アナライザーノードの作成
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      
      // マイクをアナライザーに接続
      microphone.connect(analyser);
      
      // 音声データ用の配列を作成
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      dataArrayRef.current = dataArray;
      
      // 描画ループを開始
      setIsRecording(true);
      drawWaveform();
      
      setPermissionDenied(false);
    } catch (error) {
      console.error('マイクへのアクセスに失敗しました:', error);
      setPermissionDenied(true);
    }
  };
  
  // 録音を停止
  const stopRecording = () => {
    if (microphoneStreamRef.current) {
      // トラックを停止
      microphoneStreamRef.current.getTracks().forEach(track => track.stop());
      microphoneStreamRef.current = null;
    }
    
    // アニメーションフレームをキャンセル
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // オーディオコンテキストを閉じる
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsRecording(false);
    
    // キャンバスをクリア
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  
  // 波形の描画
  const drawWaveform = () => {
    if (!analyserRef.current || !canvasRef.current || !dataArrayRef.current) {
      return;
    }
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    const bufferLength = analyser.frequencyBinCount;
    
    // キャンバスのサイズをウィンドウに合わせる
    const width = canvas.width;
    const height = canvas.height;
    
    // 音声データを取得
    analyser.getByteTimeDomainData(dataArray);
    
    // キャンバスをクリア
    ctx.clearRect(0, 0, width, height);
    
    // 波形の描画設定
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4CAF50';
    ctx.beginPath();
    
    // 音量レベルの計算のための値
    let sumSquares = 0;
    
    // 波形の描画
    const sliceWidth = width / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0; // 0-255の値を-1.0〜1.0に変換
      const y = v * height / 2;
      
      // 二乗和を計算 (RMSのため)
      sumSquares += (v - 1) * (v - 1);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    // RMS (Root Mean Square) 計算
    const rms = Math.sqrt(sumSquares / bufferLength);
    
    // RMSをデシベルに変換 (十分な音量がある場合のみ)
    // 無音に近い場合は -Infinity になるので、下限値を設定
    if (rms > 0.0001) {
      // 20 * log10(rms) の計算（音圧レベルの計算式）
      const db = 20 * Math.log10(rms);
      setDecibel(Math.max(-60, Math.round(db * 10) / 10)); // 小数点第一位まで表示、最小値を -60dB にする
    } else {
      setDecibel(-60); // 無音に近い場合
    }
    
    // アニメーションフレームを更新
    animationFrameRef.current = requestAnimationFrame(drawWaveform);
  };
  
  // コンポーネントのアンマウント時にリソースを解放
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);
  
  // dBに基づいて色を変更する関数
  const getDecibelColor = (db) => {
    if (db > -10) return 'text-red-500';
    if (db > -20) return 'text-yellow-500';
    return 'text-green-500';
  };
  
  return (
    <div className="flex flex-col items-center p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">音声波形・音量レベル可視化</h1>
      
      <div className="w-full bg-gray-100 rounded-lg p-4 mb-6">
        <canvas 
          ref={canvasRef} 
          className="w-full h-40 bg-black rounded-lg"
          width={800} 
          height={200}
        />
      </div>
      
      <div className="flex flex-col items-center mb-6">
        <div className="text-xl mb-2">音量レベル:</div>
        <div className={`text-3xl font-bold ${getDecibelColor(decibel)}`}>
          {decibel} dB
        </div>
      </div>
      
      {permissionDenied && (
        <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4">
          マイクへのアクセスが拒否されました。ブラウザの設定でマイクへのアクセスを許可してください。
        </div>
      )}
      
      <div className="flex gap-4">
        {!isRecording ? (
          <button 
            onClick={startRecording}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded"
          >
            録音開始
          </button>
        ) : (
          <button 
            onClick={stopRecording}
            className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
          >
            録音停止
          </button>
        )}
      </div>
    </div>
  );
};

export default AudioVisualizer;