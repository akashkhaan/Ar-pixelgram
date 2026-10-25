import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import MobileLayout from "@/components/layouts/MobileLayout";
import PostCard from "@/components/common/PostCard";
import { getPostById } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import type { Post } from "@/types/types";
import useGoBack from "@/hooks/use-go-back";

const PostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const goBack = useGoBack("/home");
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getPostById(id, user?.id)
      .then((p) => setPost(p))
      .catch((e) => {
        console.error("Failed to load post", e);
      })
      .finally(() => setLoading(false));
  }, [id, user?.id]);

  return (
    <MobileLayout>
      <div className="page-transition">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur border-b border-border">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted active:scale-95 transition-all text-foreground"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h2 className="text-lg font-bold text-foreground">Post</h2>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : post ? (
          <div className="max-w-xl mx-auto pb-12">
            <PostCard
              post={post}
              onDelete={() => {
                navigate("/home");
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <p className="font-semibold text-foreground mb-1">Post not found</p>
            <p className="text-sm text-muted-foreground mb-4">
              This post may have been removed or is no longer available.
            </p>
            <Link
              to="/home"
              className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold"
            >
              Back to Home
            </Link>
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default PostDetailPage;
