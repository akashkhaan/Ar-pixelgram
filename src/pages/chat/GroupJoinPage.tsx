import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Users } from "lucide-react";
import MobileLayout from "@/components/layouts/MobileLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { joinGroupByInvite } from "@/services/groups";
import { supabase } from "@/db/supabase";
import { toast } from "sonner";

interface GroupPreview {
  id: string;
  name: string;
  description?: string | null;
  avatar_url?: string | null;
  member_count?: number;
}

const GroupJoinPage: React.FC = () => {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [groupInfo, setGroupInfo] = useState<GroupPreview | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    let alive = true;
    (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc("preview_group_by_invite", { p_token: inviteToken });
        if (!rpcError && data && alive) {
          const row = Array.isArray(data) ? data[0] : data;
          if (row && row.name) {
            setGroupInfo({
              id: row.id,
              name: row.name,
              description: row.description,
              avatar_url: row.avatar_url,
              member_count: Number(row.member_count) || 1,
            });
          }
        }
      } catch {
        // fallback
      }
    })();
    return () => {
      alive = false;
    };
  }, [inviteToken]);

  const join = async () => {
    if (!inviteToken || !user || joining) return;
    setJoining(true);
    setError("");
    try {
      const groupId = await joinGroupByInvite(inviteToken);
      navigate("/group/" + groupId, { replace: true });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Invite link is invalid";
      setError(message);
      toast.error(message);
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (user && inviteToken) void join();
  }, [user, inviteToken]);

  return (
    <MobileLayout hideHeader hideNav>
      <div className="flex min-h-[100dvh] items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden ring-4 ring-primary/20 shadow-md bg-muted">
            {groupInfo?.avatar_url ? (
              <img
                src={groupInfo.avatar_url}
                alt={groupInfo.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <Users className="h-10 w-10 text-primary" />
            )}
          </div>
          <h1 className="mt-4 text-lg font-bold">{groupInfo?.name || "Join group"}</h1>
          {groupInfo?.member_count ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {groupInfo.member_count} {groupInfo.member_count === 1 ? "member" : "members"}
            </p>
          ) : null}
          {groupInfo?.description ? (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2 px-2">
              {groupInfo.description}
            </p>
          ) : null}

          <div className="mt-4">
            {authLoading || joining ? (
              <>
                <Loader2 className="mx-auto mt-2 h-6 w-6 animate-spin text-primary" />
                <p className="mt-2 text-sm text-muted-foreground">Joining securely…</p>
              </>
            ) : !user ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Log in to join this Pixelgram group.
                </p>
                <Button className="mt-4 w-full" onClick={() => navigate("/login")}>
                  Log in
                </Button>
              </>
            ) : error ? (
              <>
                <p className="mt-2 text-sm text-destructive">{error}</p>
                <Button className="mt-4 w-full" onClick={() => void join()}>
                  Try again
                </Button>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Preparing your invite…</p>
            )}
          </div>
        </div>
      </div>
    </MobileLayout>
  );
};

export default GroupJoinPage;
