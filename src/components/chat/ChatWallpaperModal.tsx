import React, { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, Upload, Check, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export interface WallpaperPreset {
  id: string;
  name: string;
  url: string;
  thumb: string;
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'cosmic',
    name: 'Cosmic Galaxy',
    url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=1200&q=80',
    thumb: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=200&q=70',
  },
  {
    id: 'neon_city',
    name: 'Neon Cyberpunk',
    url: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=1200&q=80',
    thumb: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=200&q=70',
  },
  {
    id: 'sunset_beach',
    name: 'Sunset Sky',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80',
    thumb: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=200&q=70',
  },
  {
    id: 'aurora_borealis',
    name: 'Northern Aurora',
    url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1200&q=80',
    thumb: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=200&q=70',
  },
  {
    id: 'emerald_forest',
    name: 'Forest Mist',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1200&q=80',
    thumb: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=200&q=70',
  },
  {
    id: 'abstract_violet',
    name: 'Velvet Glow',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80',
    thumb: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&q=70',
  },
  {
    id: 'pastel_clouds',
    name: 'Pastel Dream',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1200&q=80',
    thumb: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&q=70',
  },
  {
    id: 'dark_minimal',
    name: 'Dark Obsidian',
    url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1200&q=80',
    thumb: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=200&q=70',
  },
];

interface ChatWallpaperModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentWallpaper: string | null;
  onSelectWallpaper: (url: string | null) => void;
  title?: string;
}

export const ChatWallpaperModal: React.FC<ChatWallpaperModalProps> = ({
  open,
  onOpenChange,
  currentWallpaper,
  onSelectWallpaper,
  title = 'Chat Background Wallpaper',
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loadingUpload, setLoadingUpload] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose a valid image file');
      return;
    }

    setLoadingUpload(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = () => {
        // Compress image to manageable size for smooth performance & storage
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1280;
        const MAX_HEIGHT = 1920;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        onSelectWallpaper(dataUrl);
        setLoadingUpload(false);
        onOpenChange(false);
        toast.success('Gallery photo set as chat background!');
      };

      img.onerror = () => {
        setLoadingUpload(false);
        toast.error('Could not process photo');
      };
    };

    reader.onerror = () => {
      setLoadingUpload(false);
      toast.error('Could not read photo from gallery');
    };

    reader.readAsDataURL(file);
    // Reset input
    e.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl p-5 bg-card border-border shadow-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">{title}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Set background from gallery or choose from curated wallpapers
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {/* 1. Upload from Gallery button */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              disabled={loadingUpload}
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-13 rounded-2xl border-dashed border-2 border-primary/40 hover:border-primary hover:bg-primary/5 flex items-center justify-center gap-2.5 font-semibold text-sm transition-all"
            >
              {loadingUpload ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              ) : (
                <Upload className="w-5 h-5 text-primary" />
              )}
              <span>{loadingUpload ? 'Setting photo…' : 'Choose photo from Gallery (गैलरी से चुनें)'}</span>
            </Button>
          </div>

          {/* 2. Curated Wallpapers */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Messenger Themes & Wallpapers
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {WALLPAPER_PRESETS.map((preset) => {
                const isSelected = currentWallpaper === preset.url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onSelectWallpaper(preset.url);
                      onOpenChange(false);
                      toast.success(`${preset.name} wallpaper set!`);
                    }}
                    className={`group relative aspect-[4/3] rounded-2xl overflow-hidden border-2 transition-all active:scale-95 text-left ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/40 shadow-lg'
                        : 'border-border/60 hover:border-primary/60'
                    }`}
                  >
                    <img
                      src={preset.thumb}
                      alt={preset.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-2.5">
                      <span className="text-xs font-semibold text-white drop-shadow truncate">
                        {preset.name}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer: Remove Wallpaper button */}
        {currentWallpaper && (
          <div className="pt-2 border-t border-border flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onSelectWallpaper(null);
                onOpenChange(false);
                toast.success('Default wallpaper restored');
              }}
              className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive h-9 rounded-xl font-medium gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              Remove Wallpaper (हटाएं)
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ChatWallpaperModal;
