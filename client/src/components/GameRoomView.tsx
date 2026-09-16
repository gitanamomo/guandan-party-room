import React, { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Crown,
  Share2,
  Copy,
  Users,
  Play,
  RotateCcw,
  Sparkles,
  Bot,
  MessageCircle,
  HelpCircle,
  Home,
  CheckCircle2,
  Eye,
  BarChart3,
  Download,
  Gift,
  Music2,
  Volume2,
  VolumeX,
  Trophy,
  ScrollText,
  Settings,
  UserX,
  ShieldCheck,
  SmilePlus,
} from "lucide-react";
import { analyzePlay, parseCard, sortCards } from "../../../shared/guandan";
import { useLocation } from "wouter";

const AUDIO = {
  music: "/manus-storage/guandan_jiangnan_guzheng_92b90b22.mp3",
  tribute: "/manus-storage/guandan_tribute_voice_1f197aa0.wav",
  report: "/manus-storage/guandan_report_voice_f66c0b35.wav",
  huaian: {
    pass: "/manus-storage/huai_pass_eae5db4e.wav",
    bomb: "/manus-storage/huai_bomb_b2042ae8.wav",
    turn: "/manus-storage/huai_turn_655fcff6.wav",
  },
  nanjing: {
    pass: "/manus-storage/nanjing_pass_077bdba4.wav",
    bomb: "/manus-storage/nanjing_bomb_abda2fe1.wav",
    turn: "/manus-storage/nanjing_turn_630cb26b.wav",
  },
} as const;

type RoundSummary = {
  id: number;
  roundNumber: number;
  levelBefore: string;
  levelAfter: string;
  winningOrder: number[];
  winnerTeam: number;
  redPoints: number;
  bluePoints: number;
  tributeSummary?: { phase?: string; payerSeat?: number; receiverSeat?: number; antiTribute?: boolean } | null;
};

function buildRoundPoster(round: RoundSummary, seats: any[], scores: { red: number; blue: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1500;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const gradient = ctx.createLinearGradient(0, 0, 1200, 1500);
  gradient.addColorStop(0, "#25110d");
  gradient.addColorStop(0.48, "#6f271d");
  gradient.addColorStop(1, "#d8892d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#f3c86b";
  ctx.lineWidth = 10;
  ctx.strokeRect(42, 42, 1116, 1416);
  ctx.strokeStyle = "rgba(243,200,107,.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(68, 68, 1064, 1364);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe8a7";
  ctx.font = "bold 66px serif";
  ctx.fillText("掼蛋小院", 600, 175);
  ctx.font = "bold 38px serif";
  ctx.fillText("江南雅趣 · 国潮战报", 600, 235);
  ctx.fillStyle = "#f9d477";
  ctx.font = "bold 52px serif";
  ctx.fillText(`第 ${round.roundNumber} 局 · ${round.levelBefore} → ${round.levelAfter} 级`, 600, 340);

  ctx.fillStyle = "rgba(35,18,15,.75)";
  ctx.beginPath();
  ctx.roundRect(130, 420, 940, 250, 28);
  ctx.fill();
  ctx.fillStyle = "#ffdf91";
  ctx.font = "bold 42px serif";
  ctx.fillText("本局排名", 600, 485);
  const titles = ["头游", "二游", "三游", "末游"];
  round.winningOrder.forEach((seatIndex, index) => {
    const seat = seats.find((item) => item.seatIndex === seatIndex);
    ctx.fillStyle = index === 0 ? "#ffd166" : "#ffe9c2";
    ctx.font = index === 0 ? "bold 40px serif" : "32px serif";
    ctx.fillText(`${titles[index] || "末游"}  ·  ${seat?.displayName || `席位${seatIndex}`}`, 600, 545 + index * 38);
  });

  ctx.fillStyle = "#fff0c2";
  ctx.font = "bold 42px serif";
  ctx.fillText("累计战绩", 600, 790);
  ctx.fillStyle = "#ffefbd";
  ctx.font = "bold 72px serif";
  ctx.fillText(`红队 ${scores.red}  :  ${scores.blue} 蓝队`, 600, 900);
  ctx.font = "30px serif";
  ctx.fillText(`本局红队 +${round.redPoints}  ·  蓝队 +${round.bluePoints}`, 600, 960);

  ctx.fillStyle = "rgba(35,18,15,.7)";
  ctx.beginPath();
  ctx.roundRect(155, 1040, 890, 180, 22);
  ctx.fill();
  ctx.fillStyle = "#ffdda0";
  ctx.font = "30px serif";
  const tribute = round.tributeSummary?.antiTribute ? "末游持双王，抗贡成功" : round.tributeSummary?.phase === "complete" ? "进贡还牌已完成" : "待进行贡还牌";
  ctx.fillText(`牌礼：${tribute}`, 600, 1120);
  ctx.font = "26px serif";
  ctx.fillText("保存这张战报，和牌友一起回味今日牌局", 600, 1175);
  ctx.fillStyle = "#f9d477";
  ctx.font = "26px serif";
  ctx.fillText("掼蛋小院 · 江南茶馆 · 好牌常来", 600, 1360);
  return canvas.toDataURL("image/png");
}

interface GameRoomProps {
  roomCodeOrToken: string;
}

export default function GameRoomView({ roomCodeOrToken }: GameRoomProps) {
  const [, setLocation] = useLocation();

  const [guestId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const guestParam = params.get("guest");
    if (guestParam) return guestParam;

    let id = localStorage.getItem("gd_guest_id");
    if (!id) {
      id = "guest_" + Math.random().toString(36).substring(2, 9);
      localStorage.setItem("gd_guest_id", id);
    }
    return id;
  });

  const [myNickname, setMyNickname] = useState(() => {
    return localStorage.getItem("gd_nickname") || "";
  });

  const [myAvatar, setMyAvatar] = useState(() => {
    return localStorage.getItem("gd_avatar") || "tiger";
  });

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [roomPassword, setRoomPassword] = useState(() => sessionStorage.getItem(`gd_room_password_${roomCodeOrToken}`) || "");
  const [managePassword, setManagePassword] = useState("");
  const [clearRoomPassword, setClearRoomPassword] = useState(false);
  const [allowSpectatorsSetting, setAllowSpectatorsSetting] = useState(true);
  const [posterUrl, setPosterUrl] = useState("");
  const [dialect, setDialect] = useState<"huaian" | "nanjing">(() => (localStorage.getItem("gd_dialect") as "huaian" | "nanjing") || "huaian");
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("gd_sound") !== "off");
  const [musicOn, setMusicOn] = useState(() => localStorage.getItem("gd_music") !== "off");
  const [tablePulse, setTablePulse] = useState(0);
  const [hostToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("hostToken");
    if (fromUrl) {
      localStorage.setItem(`gd_host_token_${roomCodeOrToken}`, fromUrl);
      return fromUrl;
    }
    return localStorage.getItem(`gd_host_token_${roomCodeOrToken}`) || "";
  });
  const [isSpectator] = useState(() => new URLSearchParams(window.location.search).has("view"));
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const uiAudioRef = useRef<AudioContext | null>(null);
  const lastVoiceTimestampRef = useRef(0);

  const utils = trpc.useUtils();
  const roomQueryInput = useMemo(() => ({
    key: roomCodeOrToken,
    password: roomPassword || undefined,
    spectate: isSpectator,
    hostToken: hostToken || undefined,
  }), [roomCodeOrToken, roomPassword, isSpectator, hostToken]);
  const roomQuery = trpc.room.getByCodeOrToken.useQuery(
    roomQueryInput,
    { refetchInterval: 1500 }
  );

  const roomData = roomQuery.data;
  const room = roomData?.room;
  const seats = roomData?.seats || [];
  const logs = roomData?.logs || [];
  const rounds = (roomData?.rounds || []) as RoundSummary[];
  const scores = (room?.teamScores as { red: number; blue: number } | undefined) || { red: 0, blue: 0 };

  const effectiveGuestId = useMemo(() => {
    if (hostToken && room?.hostUserId && !seats.some((seat) => seat.guestId === guestId)) return `host_${room.hostUserId}`;
    return guestId;
  }, [guestId, hostToken, room?.hostUserId, seats]);

  const mySeat = useMemo(() => {
    if (!seats.length) return null;
    return seats.find((s) => s.guestId === effectiveGuestId) || null;
  }, [seats, effectiveGuestId]);

  const isHost = mySeat?.isHost || false;
  const mySeatIndex = mySeat ? mySeat.seatIndex : 0;

  useEffect(() => {
    if (room) setAllowSpectatorsSetting(room.allowSpectators !== false);
  }, [room?.id, room?.allowSpectators]);

  const playAudio = (src: string) => {
    if (!soundOn) return;
    const audio = voiceRef.current || new Audio();
    audio.src = src;
    audio.currentTime = 0;
    audio.play().catch(() => undefined);
    voiceRef.current = audio;
  };

  const playUiSound = (kind: "tap" | "success" | "card" | "chat" | "error") => {
    if (!soundOn || typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = uiAudioRef.current || new AudioContextClass();
    uiAudioRef.current = context;
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    const notes = { tap: [520], success: [523.25, 659.25, 783.99], card: [392, 523.25], chat: [440, 554.37], error: [220, 174.61] }[kind];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === "error" ? "sawtooth" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.055, now + index * 0.07 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.07 + 0.13);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + index * 0.07);
      oscillator.stop(now + index * 0.07 + 0.15);
    });
  };

  useEffect(() => {
    localStorage.setItem("gd_dialect", dialect);
    localStorage.setItem("gd_sound", soundOn ? "on" : "off");
    localStorage.setItem("gd_music", musicOn ? "on" : "off");
  }, [dialect, soundOn, musicOn]);

  useEffect(() => {
    const audio = musicRef.current;
    if (!audio) return;
    audio.volume = 0.18;
    if (musicOn) audio.play().catch(() => undefined);
    else audio.pause();
  }, [musicOn, room?.id]);

  useEffect(() => {
    const lastPlay = room?.lastPlay as { timestamp?: number; cardType?: string; text?: string } | null | undefined;
    if (!lastPlay?.timestamp || lastPlay.timestamp <= lastVoiceTimestampRef.current) return;
    lastVoiceTimestampRef.current = lastPlay.timestamp;
    setTablePulse(lastPlay.timestamp);
    playUiSound("card");
    if (lastPlay.cardType === "FREE" || lastPlay.text === "自由出牌") playAudio(AUDIO[dialect].pass);
    else if (lastPlay.cardType?.startsWith("BOMB") || lastPlay.cardType === "FOUR_JOKER_BOMB") playAudio(AUDIO[dialect].bomb);
  }, [room?.lastPlay, dialect]);

  useEffect(() => {
    const latestRound = rounds[0];
    if (!latestRound) return;
    const url = buildRoundPoster(latestRound, seats, scores);
    if (url) {
      setPosterUrl(url);
      if (!new URLSearchParams(window.location.search).has("noPoster")) setShowPosterModal(true);
      playAudio(AUDIO.report);
      playUiSound("success");
    }
  }, [rounds.length]);

  useEffect(() => {
    if (room && !mySeat && !showJoinModal) {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("view")) {
        setShowJoinModal(true);
      }
    }
  }, [room, mySeat, showJoinModal]);

  const joinMutation = trpc.room.joinSeat.useMutation({
    onSuccess: () => {
      toast.success("入座成功！欢迎来到掼蛋雅间！");
      playUiSound("success");
      setShowJoinModal(false);
      utils.room.getByCodeOrToken.invalidate();
    },
    onError: (err) => {
      playUiSound("error");
      toast.error(err.message || "入座失败");
    },
  });

  const settingsMutation = trpc.room.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("房间安全设置已更新");
      if (managePassword.trim()) sessionStorage.setItem(`gd_room_password_${roomCodeOrToken}`, managePassword.trim());
      setManagePassword("");
      setClearRoomPassword(false);
      utils.room.getByCodeOrToken.invalidate();
    },
    onError: (err) => toast.error(err.message || "设置更新失败"),
  });

  const kickMutation = trpc.room.kickSeat.useMutation({
    onSuccess: () => {
      toast.success("牌友已请离房间");
      utils.room.getByCodeOrToken.invalidate();
    },
    onError: (err) => toast.error(err.message || "请离失败"),
  });

  const transferMutation = trpc.room.transferHost.useMutation({
    onSuccess: (data) => {
      if (room) {
        const handoffUrl = `${window.location.origin}/room/${room.inviteToken}?guest=${data.hostGuestId}&hostToken=${data.hostControlToken}`;
        navigator.clipboard.writeText(`【掼蛋小院房主交接】${data.hostName}请打开此链接接管房主权限：${handoffUrl}`).catch(() => undefined);
        localStorage.removeItem(`gd_host_token_${room.roomCode}`);
      }
      toast.success("房主已转让，接管链接已复制给您转发");
      setShowManageModal(false);
    },
    onError: (err) => toast.error(err.message || "房主转让失败"),
  });

  const startMutation = trpc.room.startGame.useMutation({
    onSuccess: () => {
      toast.success("四人齐聚，对局开始！祝君大显身手！");
      playUiSound("success");
      utils.room.getByCodeOrToken.invalidate();
    },
    onError: (err) => {
      playUiSound("error");
      toast.error(err.message || "开局失败");
    },
  });

  const aiFillMutation = trpc.room.callAiToFill.useMutation({
    onSuccess: () => {
      toast.success("已召唤AI牌友补位！");
      utils.room.getByCodeOrToken.invalidate();
    },
  });

  const playMutation = trpc.room.playCards.useMutation({
    onSuccess: () => {
      setSelectedCards([]);
      playUiSound("card");
      utils.room.getByCodeOrToken.invalidate();
    },
    onError: (err) => {
      playUiSound("error");
      toast.error(err.message || "出牌失败");
    },
  });

  const passMutation = trpc.room.passTurn.useMutation({
    onSuccess: () => {
      setSelectedCards([]);
      playUiSound("tap");
      utils.room.getByCodeOrToken.invalidate();
    },
    onError: (err) => {
      playUiSound("error");
      toast.error(err.message || "过牌失败");
    },
  });

  const chatMutation = trpc.room.sendChat.useMutation({
    onSuccess: () => {
      setChatInput("");
      playUiSound("chat");
      utils.room.getByCodeOrToken.invalidate();
    },
  });

  const tributeMutation = trpc.room.submitTribute.useMutation({
    onSuccess: () => {
      toast.success("最大牌已进贡，请头游选择还牌！");
      playAudio(AUDIO.tribute);
      utils.room.getByCodeOrToken.invalidate();
    },
    onError: (err) => toast.error(err.message || "进贡失败"),
  });

  const returnMutation = trpc.room.submitReturnCard.useMutation({
    onSuccess: () => {
      toast.success("还牌完成，下一局可以开始！");
      playAudio(AUDIO.tribute);
      utils.room.getByCodeOrToken.invalidate();
    },
    onError: (err) => toast.error(err.message || "还牌失败"),
  });

  const handleCopyInviteLink = () => {
    if (!room) return;
    const inviteUrl = `${window.location.origin}/room/${room.inviteToken}`;
    navigator.clipboard.writeText(
      `【掼蛋雅间邀请】房主【${room.hostName}】邀请您入座对局！房间号：${room.roomCode}。点击链接即刻自取昵称入座：${inviteUrl}`
    );
    toast.success("邀请文本与链接已复制！发送给微信/好友即可！");
    playUiSound("success");
  };

  const toggleCardSelect = (cardId: string) => {
    playUiSound("tap");
    setSelectedCards((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    );
  };

  const handleSortHand = () => {
    if (!mySeat?.handCards) return;
    setSelectedCards([]);
    toast.info("手牌已理好（逢人配与主牌靠前）");
    playUiSound("tap");
  };

  const handlePlaySelected = () => {
    if (!room || !mySeat) return;
    if (selectedCards.length === 0) {
      toast.error("请先点击选择要出的卡牌");
      return;
    }
    playMutation.mutate({
      roomId: room.id,
      seatIndex: mySeat.seatIndex,
      cards: selectedCards,
    });
  };

  const handlePass = () => {
    if (!room || !mySeat) return;
    passMutation.mutate({
      roomId: room.id,
      seatIndex: mySeat.seatIndex,
    });
  };

  const handleSendChatMsg = (textToSend?: string) => {
    const msg = textToSend || chatInput;
    if (!msg.trim() || !room || !mySeat) return;
    chatMutation.mutate({
      roomId: room.id,
      senderName: mySeat.displayName,
      message: msg.trim(),
    });
  };

  const handleSendSticker = (sticker: string) => {
    if (!room || !mySeat) {
      toast.info("请先入座，再和牌友互动");
      return;
    }
    chatMutation.mutate({
      roomId: room.id,
      senderName: mySeat.displayName,
      message: `[表情]${sticker}`,
    });
    setShowStickerPanel(false);
    playUiSound("chat");
  };

  const handleTribute = (card: string) => {
    if (!room || !mySeat) return;
    tributeMutation.mutate({ roomId: room.id, seatIndex: mySeat.seatIndex, card });
  };

  const handleReturn = (card: string) => {
    if (!room || !mySeat) return;
    returnMutation.mutate({ roomId: room.id, seatIndex: mySeat.seatIndex, card });
  };

  const handleDownloadPoster = () => {
    if (!posterUrl) return;
    const link = document.createElement("a");
    link.href = posterUrl;
    link.download = `掼蛋小院-第${rounds[0]?.roundNumber || 1}局战报.png`;
    link.click();
    toast.success("战报海报已保存到本地！");
  };

  const handleSharePoster = async () => {
    if (!posterUrl) return;
    try {
      if (navigator.share) {
        const blob = await (await fetch(posterUrl)).blob();
        const file = new File([blob], "掼蛋小院战报.png", { type: "image/png" });
        await navigator.share({ title: "掼蛋小院战报", text: "看看我们这一局谁是牌王！", files: [file] });
      } else {
        handleDownloadPoster();
      }
    } catch {
      toast.info("当前浏览器不支持直接分享，已为您准备下载");
      handleDownloadPoster();
    }
  };

  const getRelativeSeat = (seatIdx: number) => {
    const currentMyIdx = mySeat ? mySeat.seatIndex : 0;
    return (seatIdx - currentMyIdx + 4) % 4;
  };

  const seatAtBottom = seats.find((s) => getRelativeSeat(s.seatIndex) === 0);
  const seatAtRight = seats.find((s) => getRelativeSeat(s.seatIndex) === 1);
  const seatAtTop = seats.find((s) => getRelativeSeat(s.seatIndex) === 2);
  const seatAtLeft = seats.find((s) => getRelativeSeat(s.seatIndex) === 3);
  const recentStickers = logs
    .filter((log: any) => log.type === "chat" && String(log.message).startsWith("[表情]"))
    .slice(-4);

  const currentSelectionAnalysis = useMemo(() => {
    if (!selectedCards.length || !room) return null;
    return analyzePlay(selectedCards, room.currentLevel);
  }, [selectedCards, room]);

  if (roomQuery.isLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center text-amber-200">
        <Sparkles className="w-10 h-10 animate-spin text-amber-500 mb-4" />
        <p className="text-lg tracking-wider">正在步入复古3D茶室雅间...</p>
      </div>
    );
  }

  if (!room) {
    const accessDenied = roomQuery.error?.message?.includes("密码") || roomQuery.error?.message?.includes("观战");
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center text-amber-200 p-4">
        {accessDenied ? (
          <div className="w-full max-w-md rounded-3xl border border-amber-700/50 bg-stone-900/90 p-6 shadow-2xl text-center">
            <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-amber-400" />
            <h2 className="text-2xl font-bold mb-2">进入掼蛋雅间</h2>
            <p className="text-stone-400 mb-5 text-sm">{roomQuery.error?.message?.includes("观战") ? "房主暂未开放观战权限" : "请输入房主分享的房间密码"}</p>
            {!roomQuery.error?.message?.includes("观战") && (
              <div className="flex gap-2 mb-3">
                <Input value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} type="password" placeholder="房间密码" className="bg-stone-950 border-amber-800 text-amber-100 rounded-xl" />
                <Button onClick={() => { sessionStorage.setItem(`gd_room_password_${roomCodeOrToken}`, roomPassword); roomQuery.refetch(); }} className="bg-amber-600 text-stone-950">进入</Button>
              </div>
            )}
            <Button variant="outline" onClick={() => setLocation("/")} className="border-amber-800 text-amber-200">返回茶馆大厅</Button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-2">未找到该牌桌</h2>
            <p className="text-stone-400 mb-6">房间可能已解散或邀请链接已失效</p>
            <Button onClick={() => setLocation("/")} className="bg-amber-600 text-stone-950">返回茶馆大厅</Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden bg-stone-950 font-sans text-stone-100 select-none">
      <audio ref={musicRef} src={AUDIO.music} loop preload="auto" aria-label="江南茶馆古筝背景音乐" />
      {/* 3D可爱复古八仙桌背景 */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-100"
        style={{
          backgroundImage: `url('/manus-storage/guandan_scene_retro_3d_6b57e2b8.png')`,
        }}
      />
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-stone-950/40 to-stone-950/80 pointer-events-none" />

      {/* 顶部信息条 */}
      <header className="relative z-30 w-full px-4 py-2.5 flex items-center justify-between border-b border-amber-900/50 bg-stone-950/80 backdrop-blur-md shadow-lg">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setLocation("/")}
            className="w-8 h-8 rounded-lg text-amber-300 hover:bg-amber-950/50"
            title="返回大厅"
          >
            <Home className="w-5 h-5" />
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-200 text-sm md:text-base tracking-wide">
                {room.title}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs font-mono">
                房号: {room.roomCode}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-red-950/60 text-red-300 border border-red-700/40 text-xs font-bold">
                打【{room.currentLevel}】
              </span>
              {!mySeat && (
                <span className="px-2 py-0.5 rounded-md bg-stone-800 text-stone-300 text-xs flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  观战模式
                </span>
              )}
            </div>
            <p className="text-[11px] text-amber-200/60 hidden sm:block">
              房主：{room.hostName} · 局数：第 {room.roundNumber} 局 · 南北 vs 东西组队
            </p>
          </div>
        </div>

        {/* 房主与邀请操作栏 */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowScoreModal(true)}
            className="hidden sm:flex h-8 rounded-xl bg-stone-900/60 border-amber-700/50 text-amber-200 text-xs items-center gap-1.5"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            战绩
          </Button>
          {posterUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPosterModal(true)}
              className="hidden md:flex h-8 rounded-xl bg-stone-900/60 border-amber-700/50 text-amber-200 text-xs items-center gap-1.5"
            >
              <ScrollText className="w-3.5 h-3.5" />
              战报
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleCopyInviteLink}
            className="rounded-xl bg-amber-500/20 border border-amber-400/40 hover:bg-amber-500/30 text-amber-200 text-xs h-8 px-3 font-medium flex items-center gap-1.5 shadow"
          >
            <Share2 className="w-3.5 h-3.5 text-amber-400" />
            <span>复制邀请链接</span>
          </Button>
          {isHost && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowManageModal(true)}
              className="rounded-xl bg-stone-900/60 border-amber-700/50 text-amber-200 text-xs h-8 px-3 flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              房间管理
            </Button>
          )}

          {isHost && room.status === "waiting" && (
            <Button
              size="sm"
              onClick={() => startMutation.mutate({
                roomId: room.id,
                hostToken: hostToken || undefined,
              })}
              disabled={startMutation.isPending}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-stone-950 font-bold text-xs h-8 px-3 shadow-md flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>房主开启对局</span>
            </Button>
          )}

          {isHost && room.status === "tribute" && (room.tributeInfo as any)?.phase === "complete" && (
            <Button
              size="sm"
              onClick={() => startMutation.mutate({
                roomId: room.id,
                hostToken: hostToken || undefined,
              })}
              disabled={startMutation.isPending}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-stone-950 font-bold text-xs h-8 px-3 shadow-md flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>开始下一局</span>
            </Button>
          )}

          {!mySeat && (
            <Button
              size="sm"
              onClick={() => setShowJoinModal(true)}
              className="rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs h-8 px-3"
            >
              取名入座
            </Button>
          )}

          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMusicOn((value) => !value)}
            className="w-8 h-8 rounded-lg text-amber-300 hover:bg-amber-950/50"
            title="江南古筝音乐"
          >
            {musicOn ? <Music2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSoundOn((value) => !value)}
            className="w-8 h-8 rounded-lg text-amber-300 hover:bg-amber-950/50"
            title="方言报牌音效"
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowRuleModal(true)}
            className="w-8 h-8 rounded-lg text-amber-300 hover:bg-amber-950/50"
            title="掼蛋规则说明"
          >
            <HelpCircle className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* 牌桌核心3D布局区：四方席位与手牌精细排布 */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto flex flex-col justify-between p-2 md:p-3">
        {recentStickers.length > 0 && (
          <div className="pointer-events-none absolute right-4 top-3 z-30 flex max-w-[min(80vw,360px)] flex-wrap justify-end gap-2">
            {recentStickers.map((log: any, index: number) => (
              <div
                key={`${log.createdAt || log.id || index}-${index}`}
                className="sticker-float animate-in fade-in slide-in-from-right-2 rounded-2xl border border-amber-300/40 bg-stone-950/80 px-3 py-1.5 text-sm shadow-lg backdrop-blur-md"
                title={log.senderName}
              >
                <span className="mr-1 text-[10px] text-amber-200/70">{log.senderName}</span>
                <span className="text-xl">{String(log.message).replace("[表情]", "")}</span>
              </div>
            ))}
          </div>
        )}
        {/* ================= 顶部席位 (对家 / 北席) ================= */}
        <div className="w-full flex justify-center pt-0.5">
          <SeatCard
            seat={seatAtTop}
            position="top"
            isActive={room.activeSeat === seatAtTop?.seatIndex}
              onCallAi={() => seatAtTop && aiFillMutation.mutate({ roomId: room.id, seatIndex: seatAtTop.seatIndex, hostToken: hostToken || undefined })}
            canCallAi={isHost && room.status === "waiting" && !seatAtTop?.userId && !seatAtTop?.guestId}
          />
        </div>

        {/* ================= 中间区域 (左席、中心出牌桌面八仙桌、右席) ================= */}
        <div className="flex-1 flex items-center justify-between w-full px-2 md:px-6 relative my-1">
          {/* 左侧席位 (西席) */}
          <div className="w-36 md:w-44 flex justify-start">
            <SeatCard
              seat={seatAtLeft}
              position="left"
              isActive={room.activeSeat === seatAtLeft?.seatIndex}
              onCallAi={() => seatAtLeft && aiFillMutation.mutate({ roomId: room.id, seatIndex: seatAtLeft.seatIndex, hostToken: hostToken || undefined })}
              canCallAi={isHost && room.status === "waiting" && !seatAtLeft?.userId && !seatAtLeft?.guestId}
            />
          </div>

          {/* 桌面中央：八仙桌出牌展示台 */}
          <div className="flex-1 flex flex-col items-center justify-center relative min-h-[140px] md:min-h-[190px]">
            <div key={tablePulse} className={`absolute w-44 h-44 md:w-60 md:h-60 rounded-full border-2 border-amber-600/20 ${tablePulse ? "table-pulse" : ""} bg-emerald-950/20 backdrop-blur-sm pointer-events-none shadow-2xl flex items-center justify-center`}>
              <span className="text-amber-500/20 text-4xl md:text-6xl font-serif font-black">
                掼
              </span>
            </div>

            {room.status === "waiting" ? (
              <div className="z-10 bg-stone-950/80 border border-amber-700/40 rounded-2xl p-4 text-center max-w-sm backdrop-blur-md shadow-2xl animate-fade-in">
                <Users className="w-8 h-8 text-amber-400 mx-auto mb-2 animate-bounce" />
                <h3 className="text-amber-200 font-bold text-base mb-1">等待四位牌友入座</h3>
                <p className="text-xs text-amber-200/70 mb-3">
                  当前入座情况请看四方席位。房主可将邀请链接发送给好友，也可召唤AI牌友立即开打！
                </p>
                <Button
                  size="sm"
                  onClick={handleCopyInviteLink}
                  className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs rounded-xl"
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  复制邀请链接给好友
                </Button>
              </div>
            ) : room.status === "tribute" ? (
              <TributePanel
                room={room}
                mySeat={mySeat}
                seats={seats}
                onTribute={handleTribute}
                onReturn={handleReturn}
                onPlayVoice={() => playAudio(AUDIO.tribute)}
              />
            ) : (
              <div className="z-10 flex flex-col items-center">
                {room.lastPlay && room.lastPlay.cards && room.lastPlay.cards.length > 0 ? (
                  <div className="flex flex-col items-center bg-stone-950/70 px-4 py-2 rounded-2xl border border-amber-700/30 backdrop-blur-md shadow-xl animate-scale-up">
                    <div className="text-xs text-amber-300 mb-1.5 flex items-center gap-1.5 font-medium">
                      <span>{room.lastPlay.playerName}</span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-600/30 text-amber-200 text-[10px]">
                        {room.lastPlay.text}
                      </span>
                    </div>
                    <div className="flex -space-x-3 overflow-visible py-1">
                      {room.lastPlay.cards.map((c: string) => (
                        <PlayingCardItem key={c} cardStr={c} levelRank={room.currentLevel} size="sm" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="px-3 py-1.5 rounded-full bg-stone-900/60 border border-amber-700/20 text-xs text-amber-300/80">
                    {room.activeSeat === mySeat?.seatIndex ? "轮到您领出，请任意出牌" : "新一轮自由出牌"}
                  </div>
                )}

                <div className="mt-2 text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 animate-pulse">
                  当前出牌：{seats[room.activeSeat]?.displayName || `席位${room.activeSeat}`}
                </div>
              </div>
            )}
          </div>

          {/* 右侧席位 (东席) */}
          <div className="w-36 md:w-44 flex justify-end">
            <SeatCard
              seat={seatAtRight}
              position="right"
              isActive={room.activeSeat === seatAtRight?.seatIndex}
              onCallAi={() => seatAtRight && aiFillMutation.mutate({ roomId: room.id, seatIndex: seatAtRight.seatIndex, hostToken: hostToken || undefined })}
              canCallAi={isHost && room.status === "waiting" && !seatAtRight?.userId && !seatAtRight?.guestId}
            />
          </div>
        </div>

        {/* ================= 底部玩家操作区 (并列横向排布：自座托盘在左侧，手牌与按钮在右侧，互不重叠) ================= */}
        <div className="w-full flex flex-col md:flex-row items-center justify-center gap-4 bg-stone-950/60 border border-amber-900/30 p-2 rounded-3xl backdrop-blur-md">
          {/* 底部自座人物托盘：独立在左侧，完全不被手牌覆盖 */}
          <div className="shrink-0 flex items-center justify-center">
            <SeatCard
              seat={seatAtBottom}
              position="bottom"
              isActive={room.activeSeat === seatAtBottom?.seatIndex}
              onCallAi={() => {}}
              canCallAi={false}
            />
          </div>

          {/* 右侧手牌与操作按钮容器 */}
          <div className="flex-1 flex flex-col items-center max-w-3xl overflow-hidden">
            {/* 操作控制按钮 */}
            {room.status === "playing" && mySeat && (
              <div className="flex items-center gap-2 mb-1.5 z-20">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSortHand}
                  className="h-7 px-2.5 rounded-lg bg-stone-900/80 border-amber-700/40 text-amber-200 text-xs hover:bg-amber-950/60"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  理牌
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePass}
                  disabled={room.activeSeat !== mySeat.seatIndex || passMutation.isPending}
                  className="h-7 px-2.5 rounded-lg bg-stone-900/80 border-red-800/40 text-red-200 text-xs hover:bg-red-950/60"
                >
                  要不起 / 不要
                </Button>

                <Button
                  size="sm"
                  onClick={handlePlaySelected}
                  disabled={
                    room.activeSeat !== mySeat.seatIndex ||
                    selectedCards.length === 0 ||
                    playMutation.isPending
                  }
                  className={`h-8 px-4 rounded-xl font-bold text-xs shadow-md transition-all ${
                    room.activeSeat === mySeat.seatIndex && selectedCards.length > 0
                      ? "bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-stone-950 scale-105"
                      : "bg-stone-800 text-stone-400"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  {currentSelectionAnalysis && currentSelectionAnalysis.type !== "INVALID"
                    ? `打出: ${currentSelectionAnalysis.displayName}`
                    : "打出选中牌"}
                </Button>
              </div>
            )}

            {/* 我的手牌展示 */}
            {mySeat && mySeat.handCards && mySeat.handCards.length > 0 ? (
              <div className="w-full overflow-x-auto py-1 flex justify-center z-20 scrollbar-thin">
                <div className="flex -space-x-4 md:-space-x-5 px-3">
                  {(mySeat.handCards as string[]).map((c) => {
                    const isSelected = selectedCards.includes(c);
                    return (
                      <button
                        type="button"
                        key={c}
                        onClick={() => toggleCardSelect(c)}
                        className={`transition-all duration-150 transform ${
                          isSelected ? "-translate-y-3 scale-105 z-30" : "hover:-translate-y-1.5"
                        }`}
                      >
                        <PlayingCardItem
                          cardStr={c}
                          levelRank={room.currentLevel}
                          isSelected={isSelected}
                          size="md"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      {/* 底部浮动快捷聊天与动态条 */}
      <footer className="relative z-20 px-4 py-2 border-t border-amber-900/40 bg-stone-950/90 backdrop-blur-md flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto text-xs py-1 max-w-md">
          {["对家好牌！", "我来压！", "要不起，过！", "我有炸弹！", "配合默契！"].map((quick) => (
            <button
              key={quick}
              onClick={() => handleSendChatMsg(quick)}
              className="px-2.5 py-1 rounded-full bg-stone-900 border border-amber-800/40 text-amber-200/80 hover:text-amber-100 hover:border-amber-600 whitespace-nowrap text-[11px]"
            >
              {quick}
            </button>
          ))}
        </div>

        <label className="hidden lg:flex items-center gap-1.5 text-[11px] text-amber-200/70 whitespace-nowrap">
          方言报牌
          <select value={dialect} onChange={(event) => setDialect(event.target.value as "huaian" | "nanjing")} className="h-7 rounded-lg bg-stone-900 border border-amber-800/50 text-amber-200 px-1.5">
            <option value="huaian">淮安口吻</option>
            <option value="nanjing">南京口吻</option>
          </select>
        </label>

        <div className="hidden md:flex items-center gap-2 text-xs text-amber-200/60 truncate max-w-xs">
          <MessageCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">{logs[logs.length - 1]?.message || "茶香四溢，牌局正酣"}</span>
        </div>

        <div className="relative flex items-center gap-1.5 w-60">
          {showStickerPanel && (
            <div className="absolute bottom-11 right-0 z-40 w-56 rounded-2xl border border-amber-700/60 bg-stone-950/95 p-2 shadow-2xl backdrop-blur-md">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold text-amber-200">茶馆表情包</span>
                <span className="text-[10px] text-amber-200/50">点击即发送</span>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {["👏", "👍", "😂", "😮", "😎", "🤝", "🎉", "💣", "❤️", "🙏", "🙈", "🍵"].map((sticker) => (
                  <button
                    key={sticker}
                    type="button"
                    onClick={() => handleSendSticker(sticker)}
                    className="rounded-xl p-1.5 text-xl transition hover:scale-110 hover:bg-amber-500/20 active:scale-95"
                    aria-label={`发送${sticker}表情`}
                  >
                    {sticker}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => setShowStickerPanel((value) => !value)}
            className={`h-8 w-8 shrink-0 rounded-xl border-amber-700/50 bg-stone-900/80 ${showStickerPanel ? "text-amber-100 ring-1 ring-amber-400/60" : "text-amber-300"}`}
            title="打开表情包"
          >
            <SmilePlus className="h-4 w-4" />
          </Button>
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendChatMsg()}
            placeholder="茶馆闲聊..."
            maxLength={30}
            className="h-8 text-xs bg-stone-900/80 border-amber-800/50 text-amber-100 rounded-xl"
          />
          <Button
            size="sm"
            onClick={() => handleSendChatMsg()}
            className="h-8 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 text-xs font-bold"
          >
            发送
          </Button>
        </div>
      </footer>

      {/* 弹窗1：玩家自取昵称入座弹窗 */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-amber-700/50 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="text-center">
              <Crown className="w-8 h-8 text-amber-400 mx-auto mb-1 animate-bounce" />
              <h3 className="text-xl font-bold text-amber-200">自取名号 · 入座雅间</h3>
              <p className="text-xs text-amber-200/60 mt-1">
                欢迎来到【{room.title}】，请定制您的名字与可爱3D形象：
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-amber-300 mb-1">
                您的牌友名字（自由定制）
              </label>
              <Input
                value={myNickname}
                onChange={(e) => setMyNickname(e.target.value)}
                placeholder="请输入昵称，如：淮安牌仙"
                maxLength={16}
                className="bg-stone-950 border-amber-800 text-amber-100 rounded-xl h-11"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-amber-300 mb-1">房间密码（如房主设置）</label>
              <Input
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                placeholder="无密码可留空"
                type="password"
                maxLength={32}
                className="bg-stone-950 border-amber-800 text-amber-100 rounded-xl h-11"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-amber-300 mb-2">
                选择您的萌宠卡通头像（清晰立体，不遮挡）
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { style: "panda", name: "熊猫少爷", url: "/manus-storage/char_panda_retro_a9c2931f.png" },
                  { style: "tiger", name: "锦衣小虎", url: "/manus-storage/char_tiger_retro_4237d9f5.png" },
                  { style: "bunny", name: "碧玉小兔", url: "/manus-storage/char_bunny_retro_31115b9b.png" },
                  { style: "monkey", name: "灵桃猴博士", url: "/manus-storage/char_monkey_retro_3ae39b13.png" },
                ].map((av) => (
                  <button
                    key={av.style}
                    type="button"
                    onClick={() => setMyAvatar(av.style)}
                    className={`flex flex-col items-center p-1.5 rounded-xl border transition-all ${
                      myAvatar === av.style
                        ? "bg-amber-500/20 border-amber-400 shadow-lg scale-105"
                        : "bg-stone-950 border-amber-950 hover:border-amber-700"
                    }`}
                  >
                    <img src={av.url} alt={av.name} className="w-12 h-12 rounded-lg object-cover mb-1" />
                    <span className="text-[10px] text-amber-200 truncate w-full text-center font-medium">
                      {av.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowJoinModal(false)}
                className="w-1/3 border-amber-800 text-amber-300 hover:bg-stone-800 rounded-xl"
              >
                先观战
              </Button>
              <Button
                onClick={() => {
                  if (!myNickname.trim()) {
                    toast.error("名字不能为空！");
                    return;
                  }
                  localStorage.setItem("gd_nickname", myNickname.trim());
                  localStorage.setItem("gd_avatar", myAvatar);
                  if (roomPassword.trim()) sessionStorage.setItem(`gd_room_password_${roomCodeOrToken}`, roomPassword.trim());
                  joinMutation.mutate({
                    roomId: room.id,
                    guestId,
                    displayName: myNickname.trim(),
                    avatarStyle: myAvatar,
                    password: roomPassword.trim() || undefined,
                    hostToken: hostToken || undefined,
                  });
                }}
                disabled={joinMutation.isPending}
                className="w-2/3 h-12 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-stone-950 font-bold text-base shadow-lg"
              >
                确认入座
              </Button>
            </div>
          </div>
        </div>
      )}

      {showManageModal && isHost && (
        <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-amber-700/50 rounded-3xl p-5 max-w-lg w-full shadow-2xl max-h-[86vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-amber-200 flex items-center gap-2"><Settings className="w-5 h-5 text-amber-400" />房间安全管理</h3>
              <button type="button" onClick={() => setShowManageModal(false)} className="text-amber-300/70 hover:text-amber-100">关闭</button>
            </div>
            <div className="rounded-2xl border border-amber-900/60 bg-stone-950/60 p-4 space-y-3">
              <div className="text-sm font-semibold text-amber-200">房间访问设置</div>
              <Input
                value={managePassword}
                onChange={(e) => setManagePassword(e.target.value)}
                placeholder="输入新密码；留空将取消密码"
                type="password"
                maxLength={32}
                className="bg-stone-950 border-amber-800 text-amber-100 rounded-xl"
              />
              <label className="flex items-center gap-2 text-xs text-amber-200/80 cursor-pointer">
                <input type="checkbox" checked={allowSpectatorsSetting} onChange={(e) => setAllowSpectatorsSetting(e.target.checked)} className="accent-amber-500" />
                <span>允许未入座好友观战</span>
              </label>
              <Button
                onClick={() => settingsMutation.mutate({ roomId: room.id, hostToken: hostToken || undefined, password: managePassword.trim() || undefined, clearPassword: clearRoomPassword, allowSpectators: allowSpectatorsSetting })}
                disabled={settingsMutation.isPending}
                className="w-full bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold rounded-xl"
              >
                保存访问设置
              </Button>
              <label className="flex items-center gap-2 text-[11px] text-amber-200/60 cursor-pointer">
                <input type="checkbox" checked={clearRoomPassword} onChange={(e) => setClearRoomPassword(e.target.checked)} className="accent-amber-500" />
                <span>取消现有房间密码（不勾选则留空时保持原密码）</span>
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-900/60 bg-stone-950/60 p-4 space-y-2">
              <div className="text-sm font-semibold text-amber-200 flex items-center gap-2"><UserX className="w-4 h-4 text-amber-400" />牌友管理</div>
              {seats.filter((seat) => seat.guestId && !seat.isHost).map((seat) => (
                <div key={seat.seatIndex} className="flex items-center justify-between gap-2 rounded-xl bg-stone-900 px-3 py-2 text-xs">
                  <span className="text-amber-100">{seat.displayName} · {seat.team === 0 ? "红队" : "蓝队"}</span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => transferMutation.mutate({ roomId: room.id, hostToken: hostToken || undefined, targetSeatIndex: seat.seatIndex })} className="h-7 px-2 border-emerald-700/60 text-emerald-200">转房主</Button>
                    <Button size="sm" variant="outline" onClick={() => kickMutation.mutate({ roomId: room.id, hostToken: hostToken || undefined, seatIndex: seat.seatIndex })} className="h-7 px-2 border-red-700/60 text-red-200">踢出</Button>
                  </div>
                </div>
              ))}
              {!seats.some((seat) => seat.guestId && !seat.isHost) && <p className="text-xs text-amber-200/60">暂时没有可管理的牌友。</p>}
            </div>
            <p className="mt-3 text-[11px] text-amber-200/55 leading-relaxed">转让房主会生成一次性新控制凭证，并复制交接链接；旧房主将失去管理权限。踢出后该席位可重新入座。</p>
          </div>
        </div>
      )}

      {showScoreModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-amber-700/50 rounded-3xl p-5 max-w-xl w-full shadow-2xl max-h-[82vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-amber-200 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400" />多局战绩记分板</h3>
              <button type="button" onClick={() => setShowScoreModal(false)} className="text-amber-300/70 hover:text-amber-100">关闭</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-center"><div className="text-xs text-red-200/70">红队 · 南北</div><div className="text-4xl font-black text-red-200 mt-1">{scores.red}</div><div className="text-[11px] text-red-200/60">累计级数</div></div>
              <div className="rounded-2xl border border-sky-500/40 bg-sky-950/40 p-4 text-center"><div className="text-xs text-sky-200/70">蓝队 · 东西</div><div className="text-4xl font-black text-sky-200 mt-1">{scores.blue}</div><div className="text-[11px] text-sky-200/60">累计级数</div></div>
            </div>
            <div className="space-y-2">
              {rounds.length ? rounds.map((round) => (
                <div key={round.id} className="rounded-xl bg-stone-950/80 border border-amber-900/40 px-3 py-2 flex items-center justify-between gap-3 text-xs">
                  <div className="text-amber-100 font-semibold">第{round.roundNumber}局 · {round.levelBefore}→{round.levelAfter}级</div>
                  <div className="text-amber-200/75">{round.winnerTeam === 0 ? "红队" : "蓝队"} +{round.winnerTeam === 0 ? round.redPoints : round.bluePoints}</div>
                  <div className="text-amber-200/60">{round.tributeSummary?.antiTribute ? "抗贡" : round.tributeSummary?.phase === "complete" ? "已还牌" : "待进贡"}</div>
                </div>
              )) : <div className="text-center text-sm text-amber-200/60 py-6">首局正在进行，结束后这里会自动记录战绩。</div>}
            </div>
          </div>
        </div>
      )}

      {showPosterModal && posterUrl && (
        <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-amber-700/50 rounded-3xl p-4 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-3"><h3 className="text-lg font-bold text-amber-200 flex items-center gap-2"><ScrollText className="w-5 h-5 text-amber-400" />本局国潮战报</h3><button type="button" onClick={() => setShowPosterModal(false)} className="text-amber-300/70 hover:text-amber-100">关闭</button></div>
            <img src={posterUrl} alt="掼蛋小院国潮战报海报" className="w-full max-h-[62vh] object-contain rounded-xl border border-amber-700/40 bg-amber-950/20" />
            <div className="flex gap-2 mt-3"><Button onClick={handleDownloadPoster} className="flex-1 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold"><Download className="w-4 h-4 mr-1" />保存海报</Button><Button onClick={handleSharePoster} variant="outline" className="flex-1 border-amber-700 text-amber-200"><Share2 className="w-4 h-4 mr-1" />分享给牌友</Button></div>
          </div>
        </div>
      )}

      {/* 弹窗2：掼蛋规则说明弹窗 */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-amber-700/50 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto text-amber-100 text-xs leading-relaxed">
            <h3 className="text-lg font-bold text-amber-300 text-center">掼蛋核心玩法说明</h3>
            <div className="space-y-2">
              <p><strong>1. 基本规则：</strong>四人两副牌共108张，南北组队对抗东西组队。每人27张，争先出完手牌。</p>
              <p><strong>2. 级牌与逢人配：</strong>当局主打级牌（如【2】），红心级牌为“逢人配”，可当除大小王外的任意牌配出同花顺、炸弹等。</p>
              <p><strong>3. 牌型大小：</strong>四大天王（四张王） &gt; 8炸 &gt; 7炸 &gt; 6炸 &gt; 同花顺 &gt; 5炸 &gt; 4炸 &gt; 普通牌型（顺子、三带两、钢板、连对、单张等）。</p>
              <p><strong>4. 胜负升级：</strong>双上（第一第二名同队）升3级；一三名升2级；二三名升1级；末游需向上游进贡。</p>
            </div>
            <Button
              onClick={() => setShowRuleModal(false)}
              className="w-full bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold rounded-xl h-10"
            >
              我知道了
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TributePanel({ room, mySeat, seats, onTribute, onReturn, onPlayVoice }: { room: any; mySeat: any; seats: any[]; onTribute: (card: string) => void; onReturn: (card: string) => void; onPlayVoice: () => void }) {
  const info = room.tributeInfo as { phase?: string; payerSeat?: number; receiverSeat?: number; tributeCard?: string; antiTribute?: boolean } | null;
  const isPayer = mySeat?.seatIndex === info?.payerSeat;
  const isReceiver = mySeat?.seatIndex === info?.receiverSeat;
  const sortedHand = sortCards((mySeat?.handCards as string[]) || [], room.currentLevel);
  return (
    <div className="z-10 w-[min(92vw,430px)] bg-stone-950/90 border border-amber-500/50 rounded-2xl p-4 text-center shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-center gap-2 text-amber-300 font-bold">
        <Gift className="w-5 h-5" />
        正统进贡 · 还牌仪式
        <button type="button" onClick={onPlayVoice} className="text-amber-400 hover:text-amber-200" title="播放仪式提示"><Volume2 className="w-4 h-4" /></button>
      </div>
      {info?.antiTribute ? (
        <p className="mt-3 text-sm text-emerald-300">末游持双王，抗贡成功！本局免进贡，房主可直接开始下一局。</p>
      ) : info?.phase === "tribute" ? (
        <>
          <p className="mt-2 text-xs text-amber-100/75">末游向头游进贡当前手牌中的最大牌。</p>
          {isPayer ? (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {sortedHand.map((card) => <button type="button" key={card} onClick={() => onTribute(card)} className="hover:-translate-y-1 transition-transform"><PlayingCardItem cardStr={card} levelRank={room.currentLevel} size="sm" /></button>)}
            </div>
          ) : <p className="mt-3 text-xs text-amber-300/70">等待【{seats.find((seat) => seat.seatIndex === info?.payerSeat)?.displayName || "末游"}】选择最大牌进贡…</p>}
        </>
      ) : info?.phase === "return" ? (
        <>
          <p className="mt-2 text-xs text-amber-100/75">头游收到进贡后，从手牌中选择一张牌还给末游。</p>
          {isReceiver ? (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {sortedHand.map((card) => <button type="button" key={card} onClick={() => onReturn(card)} className="hover:-translate-y-1 transition-transform"><PlayingCardItem cardStr={card} levelRank={room.currentLevel} size="sm" /></button>)}
            </div>
          ) : <p className="mt-3 text-xs text-amber-300/70">等待【{seats.find((seat) => seat.seatIndex === info?.receiverSeat)?.displayName || "头游"}】选择还牌…</p>}
        </>
      ) : <p className="mt-3 text-sm text-emerald-300">进贡还牌完成，等待房主开始下一局。</p>}
    </div>
  );
}

// 单席位木牌托盘（绝对不挡人物）
interface SeatCardProps {
  seat: any;
  position: "top" | "bottom" | "left" | "right";
  isActive: boolean;
  onCallAi: () => void;
  canCallAi: boolean;
}

function SeatCard({ seat, position, isActive, onCallAi, canCallAi }: SeatCardProps) {
  if (!seat) return null;

  const isOccupied = !!(seat.userId || seat.guestId);
  const avatarUrl = seat.avatarUrl || "/manus-storage/char_panda_retro_a9c2931f.png";

  return (
    <div className="relative flex flex-col items-center transition-all duration-300">
      {/* 3D可爱萌宠角色立绘画像（不加任何文字遮挡） */}
      <div className="relative group">
        <div
          className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden border-2 bg-stone-950 shadow-xl transition-all duration-300 ${
            isActive
              ? "border-amber-400 ring-4 ring-amber-500/40 scale-105 seat-bob"
              : isOccupied
              ? "border-amber-800/60"
              : "border-stone-800 opacity-60"
          }`}
        >
          {isOccupied ? (
            <img
              src={avatarUrl}
              alt={seat.displayName}
              className="w-full h-full object-cover filter contrast-105"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-stone-900/80 text-stone-500 p-2 text-center">
              <Users className="w-6 h-6 mb-1 opacity-50" />
              <span className="text-[10px]">待入座</span>
            </div>
          )}
        </div>

        {seat.isHost && (
          <span className="absolute -top-2 -left-2 bg-gradient-to-r from-amber-500 to-yellow-400 text-stone-950 p-1 rounded-full shadow-md">
            <Crown className="w-3.5 h-3.5 fill-current" />
          </span>
        )}

        {seat.rankFinish > 0 && (
          <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black shadow-lg">
            {["", "头游👑", "二游🥈", "三游🥉", "末游"][seat.rankFinish]}
          </span>
        )}

        {isActive && (
          <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
          </span>
        )}
      </div>

      {/* 独立名牌木托盘（置于人物之外，文字清晰，绝对不遮挡人物） */}
      <div className="mt-1 px-2.5 py-1 rounded-xl bg-stone-950/85 border border-amber-900/60 backdrop-blur-md shadow-md text-center max-w-[120px] md:max-w-[140px]">
        <div className="text-xs font-semibold text-amber-200 truncate">
          {seat.displayName}
        </div>
        <div className="text-[10px] text-amber-200/60 flex items-center justify-center gap-1">
          <span>{seat.team === 0 ? "红队(南北)" : "蓝队(东西)"}</span>
          {seat.handCount > 0 && <span>· 余{seat.handCount}张</span>}
        </div>
      </div>

      {canCallAi && (
        <Button
          size="sm"
          variant="outline"
          onClick={onCallAi}
          className="mt-1 h-6 px-2 text-[10px] rounded-lg border-amber-600/40 bg-stone-900/80 text-amber-300 hover:bg-amber-950 flex items-center gap-1 shadow"
        >
          <Bot className="w-3 h-3 text-amber-400" />
          <span>召唤AI补位</span>
        </Button>
      )}
    </div>
  );
}

// 单张扑克牌渲染
interface PlayingCardItemProps {
  cardStr: string;
  levelRank: string;
  isSelected?: boolean;
  size?: "sm" | "md" | "lg";
}

function PlayingCardItem({ cardStr, levelRank, isSelected = false, size = "md" }: PlayingCardItemProps) {
  const card = parseCard(cardStr, levelRank);
  const isRed = card.suit === "♥" || card.suit === "♦" || card.rank === "BJ";

  const sizeStyles = {
    sm: "w-9 h-13 md:w-11 md:h-16 text-[10px] md:text-xs",
    md: "w-11 h-16 md:w-14 md:h-20 text-xs md:text-sm",
    lg: "w-14 h-20 md:w-18 md:h-26 text-sm md:text-base",
  }[size];

  return (
    <div
      className={`relative ${sizeStyles} rounded-lg bg-stone-100 card-pop border border-stone-300 shadow-md flex flex-col justify-between p-1 font-bold ${
        isRed ? "text-red-600" : "text-stone-900"
      } ${isSelected ? "ring-2 ring-amber-500 shadow-amber-500/50" : ""}`}
    >
      {card.isRedHeartLevel ? (
        <span className="absolute top-0.5 right-0.5 text-[8px] bg-red-600 text-white px-1 rounded-sm">
          配
        </span>
      ) : card.isLevelCard ? (
        <span className="absolute top-0.5 right-0.5 text-[8px] bg-amber-600 text-white px-0.5 rounded-sm">
          主
        </span>
      ) : null}

      <div className="flex flex-col items-center leading-none">
        <span>{card.rank === "BJ" ? "大王" : card.rank === "SJ" ? "小王" : card.rank}</span>
        {card.suit !== "JOKER" && <span className="text-sm">{card.suit}</span>}
      </div>

      <div className="text-center text-sm md:text-lg opacity-80">
        {card.suit !== "JOKER" ? card.suit : "👑"}
      </div>

      <div className="flex flex-col items-center leading-none rotate-180">
        <span>{card.rank === "BJ" ? "大王" : card.rank === "SJ" ? "小王" : card.rank}</span>
      </div>
    </div>
  );
}
