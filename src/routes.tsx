import RootRedirect from './components/common/RootRedirect';
import React, { lazy, type ReactNode } from 'react';

/**
 * Safe lazy loader with auto-retry and cache-busting recovery on dynamic import errors.
 * Fixes: "Failed to fetch dynamically imported module" caused by network drops
 * or stale deployment chunk hashes on Render/Vercel/CDN.
 */
function safeLazy<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await factory();
      } catch (error: any) {
        const errorMsg = String(error?.message || error || '');
        const isDynamicImportError =
          errorMsg.includes('fetch dynamically imported module') ||
          errorMsg.includes('error loading dynamically imported module') ||
          errorMsg.includes('Loading chunk') ||
          errorMsg.includes('Failed to fetch') ||
          error?.name === 'ChunkLoadError';

        if (attempt < retries && isDynamicImportError) {
          // Wait before retry (600ms, 1200ms)
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
          continue;
        }

        if (isDynamicImportError && typeof window !== 'undefined') {
          // Check if we haven't reloaded recently (prevents infinite loop)
          const storageKey = 'chunk_fail_reload_' + window.location.pathname;
          const lastReload = sessionStorage.getItem(storageKey);
          const now = Date.now();

          if (!lastReload || now - Number(lastReload) > 12000) {
            sessionStorage.setItem(storageKey, String(now));
            const reloadUrl = new URL(window.location.href);
            reloadUrl.searchParams.set('_r', String(now));
            window.location.replace(reloadUrl.toString());
            // Keep Suspense pending until browser completes reload
            return new Promise<{ default: T }>(() => {});
          }
        }

        throw error;
      }
    }
    throw new Error('Failed to load component');
  });
}

const LoginPage = safeLazy(() => import('./pages/auth/LoginPage'));
const ForgotPasswordPage = safeLazy(() => import('./pages/auth/ForgotPasswordPage'));
const RegisterPage = safeLazy(() => import('./pages/auth/RegisterPage'));
const AccountDeletedPage = safeLazy(() => import('./pages/auth/AccountDeletedPage'));
const HomePage = safeLazy(() => import('./pages/home/HomePage'));
const VideosPage = safeLazy(() => import('./pages/videos/VideosPage'));
const WatchVideoPage = safeLazy(() => import('./pages/videos/WatchVideoPage'));
const UploadVideoPage = safeLazy(() => import('./pages/videos/UploadVideoPage'));
const CreatePostPage = safeLazy(() => import('./pages/post/CreatePostPage'));
const PostDetailPage = safeLazy(() => import('./pages/post/PostDetailPage'));
const StoriesPage = safeLazy(() => import('./pages/stories/StoriesPage'));
const ChatListPage = safeLazy(() => import('./pages/chat/ChatListPage'));
const ChatPage = safeLazy(() => import('./pages/chat/ChatPage'));
const CreateGroupPage = safeLazy(() => import('./pages/chat/CreateGroupPage'));
const GroupChatPage = safeLazy(() => import('./pages/chat/GroupChatPage'));
const GroupJoinPage = safeLazy(() => import('./pages/chat/GroupJoinPage'));
const NotificationsPage = safeLazy(() => import('./pages/notifications/NotificationsPage'));
const ProfilePage = safeLazy(() => import('./pages/profile/ProfilePage'));
const EditProfilePage = safeLazy(() => import('./pages/profile/EditProfilePage'));
const SettingsPage = safeLazy(() => import('./pages/settings/SettingsPage'));
const AccountCenterPage = safeLazy(() => import('./pages/settings/AccountCenterPage'));
const LanguagePage = safeLazy(() => import('./pages/settings/LanguagePage'));
const NotificationSettingsPage = safeLazy(() => import('./pages/settings/NotificationSettingsPage'));
const ReelsPage = safeLazy(() => import('./pages/reels/ReelsPage'));
const CreateReelPage = safeLazy(() => import('./pages/reels/CreateReelPage'));
const SongPage = safeLazy(() => import('./pages/music/SongPage'));
const PeoplePage = safeLazy(() => import('./pages/people/PeoplePage'));
const ReportUserPage = safeLazy(() => import('./pages/report/ReportUserPage'));
const AppealPage = safeLazy(() => import('./pages/appeal/AppealPage'));
const AdminDashboard = safeLazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = safeLazy(() => import('./pages/admin/AdminUsers'));
const AdminContent = safeLazy(() => import('./pages/admin/AdminContent'));
const AdminVerification = safeLazy(() => import('./pages/admin/AdminVerification'));
const AdminReports = safeLazy(() => import('./pages/admin/AdminReports'));
const AdminBroadcast = safeLazy(() => import('./pages/admin/AdminBroadcast'));
const AdminAnalytics = safeLazy(() => import('./pages/admin/AdminAnalytics'));
const AdminVisitors = safeLazy(() => import('./pages/admin/AdminVisitors'));
const AdminLoginPage = safeLazy(() => import('./pages/admin/AdminLoginPage'));
const AccessTokenPage = safeLazy(() => import('./pages/settings/AccessTokenPage'));
const AdminTokens = safeLazy(() => import('./pages/admin/AdminTokens'));

const FollowListPage = safeLazy(() => import('./pages/profile/FollowListPage'));

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  public?: boolean;
}

export const routes: RouteConfig[] = [
  // Public routes
  { name: 'Root', path: '/', element: <RootRedirect />, public: true },
  { name: 'Login', path: '/login', element: <LoginPage />, public: true },
  { name: 'Forgot Password', path: '/forgot-password', element: <ForgotPasswordPage />, public: true },
  { name: 'Register', path: '/register', element: <RegisterPage />, public: true },
  { name: 'Admin Login', path: '/admin-login', element: <AdminLoginPage />, public: true },
  { name: 'Appeal', path: '/appeal', element: <AppealPage />, public: true },
  { name: 'Account Deleted', path: '/account-deleted', element: <AccountDeletedPage />, public: true },

  // Main app routes (require auth)
  { name: 'Home', path: '/home', element: <HomePage /> },
  { name: 'Videos', path: '/videos', element: <VideosPage /> },
  { name: 'Watch Video', path: '/videos/:videoId', element: <WatchVideoPage /> },
  { name: 'Upload Video', path: '/upload-video', element: <UploadVideoPage /> },
  { name: 'Create Post', path: '/create', element: <CreatePostPage /> },
  { name: 'Post Detail', path: '/post/:id', element: <PostDetailPage /> },
  { name: 'Stories', path: '/stories', element: <StoriesPage /> },
  { name: 'Reels', path: '/reels', element: <ReelsPage /> },
  { name: 'Create Reel', path: '/create-reel', element: <CreateReelPage /> },
  { name: 'Song', path: '/song/:trackId', element: <SongPage /> },
  { name: 'People', path: '/people', element: <PeoplePage /> },
  { name: "Chat", path: "/chat", element: <ChatListPage /> },
  { name: "Messages", path: "/messages", element: <ChatListPage /> },
  { name: "Direct Inbox", path: "/direct/inbox", element: <ChatListPage /> },
  { name: "Chat Conversation", path: "/chat/:receiverId", element: <ChatPage /> },
  { name: "Messages Direct User Chat", path: "/messages/user/:receiverId", element: <ChatPage /> },
  { name: 'Create Group', path: '/groups/new', element: <CreateGroupPage /> },
  { name: 'Group Chat', path: '/group/:groupId', element: <GroupChatPage /> },
  { name: 'Facebook Messages Group Chat', path: '/messages/t/:groupId', element: <GroupChatPage /> },
  { name: 'Messages Group Chat', path: '/messages/group/:groupId', element: <GroupChatPage /> },
  { name: 'Join Group', path: '/group/join/:inviteToken', element: <GroupJoinPage /> },
  { name: 'Notifications', path: '/notifications', element: <NotificationsPage /> },
  { name: 'Profile', path: '/profile', element: <ProfilePage /> },
  { name: 'User Profile', path: '/profile/:userId', element: <ProfilePage /> },
  { name: 'Profile Facebook URL', path: '/profile.php', element: <ProfilePage /> },
  { name: 'Edit Profile', path: '/edit-profile', element: <EditProfilePage /> },
  { name: 'Settings', path: '/settings', element: <SettingsPage /> },
  { name: 'Notification Settings', path: '/settings/notifications', element: <NotificationSettingsPage /> },
  { name: 'Account Center', path: '/settings/account-center', element: <AccountCenterPage /> },
  { name: 'Language', path: '/settings/language', element: <LanguagePage /> },
  { name: 'Access Token', path: '/settings/access-token', element: <AccessTokenPage /> },
  { name: 'Report User', path: '/report-user/:userId', element: <ReportUserPage /> },
  { name: 'Followers', path: '/followers/:userId', element: <FollowListPage /> },
  { name: 'Following', path: '/following/:userId', element: <FollowListPage /> },

  // Admin routes
  { name: 'Admin Dashboard', path: '/admin', element: <AdminDashboard /> },
  { name: 'Admin Users', path: '/admin/users', element: <AdminUsers /> },
  { name: 'Admin Content', path: '/admin/content', element: <AdminContent /> },
  { name: 'Admin Verification', path: '/admin/verification', element: <AdminVerification /> },
  { name: 'Admin Reports', path: '/admin/reports', element: <AdminReports /> },
  { name: 'Admin Broadcast', path: '/admin/broadcast', element: <AdminBroadcast /> },
  { name: 'Admin Analytics', path: '/admin/analytics', element: <AdminAnalytics /> },
  { name: 'Admin Visitors', path: '/admin/visitors', element: <AdminVisitors /> },
  { name: 'Admin Tokens', path: '/admin/tokens', element: <AdminTokens /> },
];
