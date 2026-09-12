import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Sparkles, Users, Crown, Play, Dices, ArrowRight } from "lucide-react";

export default function LobbyView() {
  const [, setLocation] = useLocation();
  const [displayName, setDisplayName] = useState(() => {
    return localStorage.getItem("gd_nickname") || "南山少爷";
  });
  const [roomTitle, setRoomTitle] = useState("江南雅趣掼蛋室");
  const [selectedAvatar, setSelectedAvatar] = useState("panda");
  const [joinCode, setJoinCode] = useState("");

  const { data: avatars } = trpc.room.getAvatars.useQuery();

  const createRoomMutation = trpc.room.create.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("gd_nickname", displayName);
      localStorage.setItem("gd_avatar", selectedAvatar);
      localStorage.setItem("gd_guest_id", "guest_" + Math.random().toString(36).substring(2, 9));
      localStorage.setItem(`gd_host_token_${data.roomCode}`, data.hostControlToken);
      toast.success("房间开辟成功！您是房主，快邀请牌友入座吧！");
      setLocation(`/room/${data.roomCode}`);
    },
    onError: (err) => {
      toast.error(err.message || "开房失败，请重试");
    },
  });

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error("客官，请先给自己取一个霸气或可爱的名字！");
      return;
    }
    createRoomMutation.mutate({
      title: roomTitle,
      displayName: displayName.trim(),
      avatarStyle: selectedAvatar,
      targetScore: 14,
    });
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error("加入前请先给自己取个名字！");
      return;
    }
    if (!joinCode.trim()) {
      toast.error("请输入6位房间号或邀请码");
      return;
    }
    localStorage.setItem("gd_nickname", displayName.trim());
    localStorage.setItem("gd_avatar", selectedAvatar);
    setLocation(`/room/${joinCode.trim()}`);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden bg-amber-950 font-sans text-stone-100 selection:bg-amber-500 selection:text-white">
      {/* 3D复古国风江南茶室背景 */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-luminosity scale-105 filter blur-[1px] transition-transform duration-1000"
        style={{ backgroundImage: `url('/manus-storage/guandan_scene_retro_3d_6b57e2b8.png')` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-stone-950/80 via-stone-900/60 to-stone-950/90 pointer-events-none" />

      {/* 顶部标题栏 */}
      <header className="relative z-10 w-full px-6 py-4 flex items-center justify-between border-b border-amber-900/40 bg-stone-950/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-inner">
            <Dices className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-wider text-amber-200 drop-shadow-md">
              掼蛋小院 <span className="text-xs px-2 py-0.5 rounded-full bg-amber-600/30 text-amber-300 border border-amber-500/30 font-normal">可爱复古3D</span>
            </h1>
            <p className="text-xs text-amber-200/60">四人好友对局 · 房主开房 · 自定义昵称 · 链接直达</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-950/60 border border-amber-800/40 text-xs text-amber-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            茶馆包间已就绪
          </div>
        </div>
      </header>

      {/* 主操作区 */}
      <main className="relative z-10 container max-w-4xl mx-auto px-4 py-8 flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          {/* 左侧形象与名字设置 */}
          <Card className="md:col-span-7 bg-stone-900/80 border-amber-900/50 backdrop-blur-xl p-6 rounded-3xl shadow-2xl relative overflow-hidden text-stone-200">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center gap-2 text-amber-300 mb-4 font-semibold text-lg">
              <Crown className="w-5 h-5 text-amber-400" />
              <span>定制您的专属牌友名号</span>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-xs uppercase tracking-wider text-amber-300/80 mb-2 font-medium">
                  1. 玩家自取昵称（随心所欲，免受束缚）
                </label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="请输入您的霸气/可爱昵称，如：雀圣阿宝"
                  maxLength={18}
                  className="bg-stone-950/70 border-amber-800/60 text-amber-100 text-base placeholder:text-stone-500 h-12 rounded-xl focus-visible:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-amber-300/80 mb-2 font-medium">
                  2. 选择可爱3D复古卡通形象（永不挡字）
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {avatars?.map((av) => {
                    const isSelected = selectedAvatar === av.style;
                    return (
                      <button
                        type="button"
                        key={av.style}
                        onClick={() => setSelectedAvatar(av.style)}
                        className={`group relative flex flex-col items-center p-2 rounded-2xl border transition-all duration-300 ${
                          isSelected
                            ? "bg-amber-500/20 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)] scale-105"
                            : "bg-stone-950/50 border-amber-950 hover:border-amber-700/50 hover:bg-stone-900/50"
                        }`}
                      >
                        <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl overflow-hidden bg-stone-900 mb-1.5 shadow-md border border-amber-800/30">
                          <img
                            src={av.url}
                            alt={av.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                        </div>
                        <span className="text-xs text-amber-200/90 font-medium truncate w-full text-center">
                          {av.name}
                        </span>
                        {isSelected && (
                          <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-stone-950 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
                            已选
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-amber-300/80 mb-2 font-medium">
                  3. 雅间牌桌名称
                </label>
                <Input
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  placeholder="房间名称"
                  maxLength={25}
                  className="bg-stone-950/70 border-amber-800/60 text-amber-100 h-10 rounded-xl focus-visible:ring-amber-500 text-sm"
                />
              </div>

              <Button
                onClick={handleCreateRoom}
                disabled={createRoomMutation.isPending}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-500 hover:from-amber-500 hover:to-yellow-500 text-stone-950 font-bold text-lg shadow-lg shadow-amber-900/50 transition-all hover:scale-[1.01] active:scale-[0.98] border border-amber-300/40"
              >
                <Sparkles className="w-5 h-5 mr-2 animate-bounce" />
                {createRoomMutation.isPending ? "正在布置八仙雅座..." : "主账户立即开房（当房主）"}
              </Button>
            </div>
          </Card>

          {/* 右侧加入房间与邀请说明 */}
          <div className="md:col-span-5 space-y-6">
            <Card className="bg-stone-900/70 border-amber-900/40 backdrop-blur-xl p-6 rounded-3xl shadow-xl text-stone-200">
              <div className="flex items-center gap-2 text-amber-300 mb-3 font-semibold text-base">
                <Users className="w-5 h-5 text-amber-400" />
                <span>已有房间？输入房间号加入</span>
              </div>
              <p className="text-xs text-amber-200/60 mb-4">
                收到房主分享的6位房间号或邀请链接后，即可在此直接入座游玩。
              </p>

              <form onSubmit={handleJoinByCode} className="space-y-3">
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="输入6位房间号 (如 888666)"
                  maxLength={16}
                  className="bg-stone-950/70 border-amber-800/60 text-center tracking-widest text-lg font-mono text-amber-200 h-12 rounded-xl focus-visible:ring-amber-500"
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full h-12 rounded-xl border-amber-600/50 hover:bg-amber-900/30 text-amber-200 font-semibold text-base"
                >
                  前往牌桌入座
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </form>
            </Card>

            {/* 规则与优化亮点卡片 */}
            <div className="p-5 rounded-3xl bg-amber-950/30 border border-amber-900/40 text-xs space-y-2.5 text-amber-200/80">
              <div className="font-semibold text-amber-300 flex items-center gap-1.5 text-sm">
                <Play className="w-4 h-4 text-amber-400" />
                游戏玩法与贴心优化特性：
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">1.</span>
                <span><strong>文字与人物分层：</strong>所有牌手名号、对局信息置于精致木牌托盘，绝对不遮挡可爱3D角色面容与身形。</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">2.</span>
                <span><strong>自主命名进房：</strong>每位朋友输入自定义昵称与自选萌宠形象，即刻就座。</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">3.</span>
                <span><strong>房主开房给链接：</strong>主账户一键开房，提供专属邀请链接，其他三位微信/浏览器点击即入！缺人时支持一键召唤智能AI陪练补位。</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 底部版权 */}
      <footer className="relative z-10 py-3 text-center text-xs text-amber-200/40">
        掼蛋小院 · 正统江苏安徽双副扑克争先对局 · 可爱复古3D茶室
      </footer>
    </div>
  );
}
