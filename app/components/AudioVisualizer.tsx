"use client";

import React, { useState, useEffect, useRef } from 'react';

// Interface for window with potential webkitAudioContext
interface ExtendedWindow extends Window {
  AudioContext: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

// 花吹雪用の粒子を定義
interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  speedX: number;
  speedY: number;
  opacity: number;
}

const AudioVisualizer = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [decibel, setDecibel] = useState(0);
  const [maxDecibel, setMaxDecibel] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [hasReachedThreshold, setHasReachedThreshold] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const celebrationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const celebrationAnimationFrameRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  
  // マイクへのアクセスを開始
  const startRecording = async () => {
    try {
      // 既存のオーディオコンテキストをリセット
      if (audioContextRef.current) {
        await audioContextRef.current.close();
      }
      
      // オーディオコンテキストの作成
      const extendedWindow = window as ExtendedWindow;
      const AudioContextClass = extendedWindow.AudioContext || extendedWindow.webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      
      // マイクからの音声ストリームを取得
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      microphoneStreamRef.current = stream;
      
      // オーディオソースを作成
      if (audioContextRef.current) {
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
        setMaxDecibel(0); // Reset max decibel when starting recording
        setHasReachedThreshold(false); // リセット
        drawWaveform();
      }
      
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
      microphoneStreamRef.current.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
    }
    
    // アニメーションフレームをキャンセル
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // 花吹雪アニメーションを停止
    stopCelebration();
    
    // オーディオコンテキストを閉じる
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsRecording(false);
    
    // キャンバスをクリア
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };
  
  // 波形の描画
  const drawWaveform = () => {
    if (!analyserRef.current || !canvasRef.current || !dataArrayRef.current) {
      return;
    }
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
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
      const rawDb = 20 * Math.log10(rms);
      // -60dBを0として調整し、正の値にする（例：-40dBは20になる）
      const adjustedDb = Math.max(0, rawDb + 60);
      const currentDb = Math.round(adjustedDb * 10) / 10; // 小数点第一位まで表示
      setDecibel(currentDb);
      
      // 最大値の更新 - prevMaxを使用して確実に最新の値と比較
      setMaxDecibel(prevMax => {
        const newMax = Math.max(prevMax, currentDb);
        
        // 最大値が50を超えて、まだお祝いが表示されていない場合はお祝いを表示
        if (newMax > 50 && !hasReachedThreshold) {
          setHasReachedThreshold(true);
          startCelebration();
        }
        
        return newMax;
      });
    } else {
      setDecibel(0); // 無音に近い場合は0に
    }
    
    // アニメーションフレームを更新
    animationFrameRef.current = requestAnimationFrame(drawWaveform);
  };
  
  // お祝いアニメーションを開始
  const startCelebration = () => {
    setShowCelebration(true);
    
    // 花吹雪の粒子を生成
    const particles: Particle[] = [];
    for (let i = 0; i < 100; i++) {
      particles.push(createParticle());
    }
    particlesRef.current = particles;
    
    // アニメーションの開始
    animateCelebration();
  };
  
  // お祝いアニメーションを停止
  const stopCelebration = () => {
    setShowCelebration(false);
    if (celebrationAnimationFrameRef.current !== null) {
      cancelAnimationFrame(celebrationAnimationFrameRef.current);
      celebrationAnimationFrameRef.current = null;
    }
    
    // キャンバスをクリア
    const canvas = celebrationCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };
  
  // 新しい粒子を作成
  const createParticle = (): Particle => {
    const canvas = celebrationCanvasRef.current;
    if (!canvas) {
      return {
        x: 0,
        y: 0,
        size: 5,
        color: '#ff0000',
        speedX: 0,
        speedY: 0,
        opacity: 1
      };
    }
    
    const colors = ['#ff7979', '#ffbe76', '#badc58', '#7ed6df', '#e056fd', '#686de0', '#ff9ff3'];
    
    return {
      x: Math.random() * canvas.width,
      y: -10,
      size: Math.random() * 6 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedX: Math.random() * 2 - 1,
      speedY: Math.random() * 2 + 2,
      opacity: 1
    };
  };
  
  // 花吹雪アニメーション
  const animateCelebration = () => {
    const canvas = celebrationCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // キャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 粒子を更新して描画
    for (let i = 0; i < particlesRef.current.length; i++) {
      const p = particlesRef.current[i];
      
      p.opacity -= 0.005;
      p.x += p.speedX;
      p.y += p.speedY;
      
      // 透明度が0以下になった粒子を再生成
      if (p.opacity <= 0) {
        particlesRef.current[i] = createParticle();
        continue;
      }
      
      // キャンバス外に出たら再生成
      if (p.y > canvas.height) {
        particlesRef.current[i] = createParticle();
        continue;
      }
      
      // 粒子を描画
      ctx.beginPath();
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    
    // アニメーションを続ける
    celebrationAnimationFrameRef.current = requestAnimationFrame(animateCelebration);
  };
  
  // コンポーネントがマウントされたらキャンバスサイズを設定
  useEffect(() => {
    const updateCelebrationCanvasSize = () => {
      const canvas = celebrationCanvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    
    // 初期設定
    updateCelebrationCanvasSize();
    
    // リサイズイベントのリスナー登録
    window.addEventListener('resize', updateCelebrationCanvasSize);
    
    return () => {
      window.removeEventListener('resize', updateCelebrationCanvasSize);
      stopRecording();
    };
  }, []);
  
  // dBに基づいて色を変更する関数
  const getDecibelColor = (db: number) => {
    if (db > 50) return 'text-red-500';    // -10dB相当
    if (db > 40) return 'text-yellow-500'; // -20dB相当
    return 'text-green-500';
  };
  
  // 最大値リセットボタンのハンドラ
  const resetMaxDecibel = () => {
    setMaxDecibel(0);
    setHasReachedThreshold(false);
    stopCelebration();
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
        
        <div className="mt-4">
          <div className="text-xl mb-2">最大音量:</div>
          <div className={`text-3xl font-bold ${getDecibelColor(maxDecibel)}`}>
            {maxDecibel} dB
          </div>
          {isRecording && (
            <button 
              onClick={resetMaxDecibel}
              className="mt-2 bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-1 rounded text-sm"
            >
              最大値をリセット
            </button>
          )}
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
      
      {/* お祝いの花吹雪アニメーション用キャンバス - 全画面に表示 */}
      {showCelebration && (
        <canvas 
          ref={celebrationCanvasRef}
          className="fixed top-0 left-0 w-full h-full pointer-events-none z-50"
        />
      )}
    </div>
  );
};

export default AudioVisualizer;