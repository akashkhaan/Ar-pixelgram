import RootRedirect from './components/common/RootRedirect';
import { lazy, type ReactNode } from 'react';
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const AccountDeletedPage = lazy(() => import('./pages/auth/AccountDeletedPage'));
const HomePage = lazy(() => import('./pages/home/HomePage'));
const VideosPage = lazy(() => import('./pages/videos/VideosPage'));
const WatchVideoPage = lazy(() => import('./pages/videos/WatchVideoPage'));
const UploadVideoPage = lazy(() => import('./pages/videos/UploadVideoPage'));
const CreatePostPage = lazy(() => import('./pages/post/CreatePostPage'));
const PostDetailPage = lazy(() => import('./pages/post/PostDetailPage'));
const StoriesPage = lazy(() => import('./pages/stories/StoriesPage'));
const ChatListPage = lazy(() => import('./pages/chat/ChatListPage'));
const AiChatPage = lazy(() => import('./pages/chat/AiChatPage'));
const ChatPage = lazy(() => import('./pages/chat/ChatPage'));
const CreateGroupPage = lazy(() => import('./pages/chat/CreateGroupPage'));
const GroupChatPage = lazy(() => import('./pages/chat/GroupChatPage'));
const GroupJoinPage = lazy(() => import('./pages/chat/GroupJoinPage'));
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const EditProfilePage = lazy(() => import('./pages/profile/EditProfilePage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const AccountCenterPage = lazy(() => import('./pages/settings/AccountCenterPage'));
const LanguagePage = lazy(() => import('./pages/settings/LanguagePage'));
const NotificationSettingsPage = lazy(() => import('./pages/settings/NotificationSettingsPage'));
const ReelsPage = lazy(() => import('./pages/reels/ReelsPage'));
const CreateReelPage = lazy(() => import('./pages/reels/CreateReelPage'));
const SongPage = lazy(() => import('./pages/music/SongPage'));
const PeoplePage = lazy(() => import('./pages/people/PeoplePage'));
const ReportUserPage = lazy(() => import('./pages/report/ReportUserPage'));
const AppealPage = lazy(() => import('./pages/appeal/AppealPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminContent = lazy(() => import('./pages/admin/AdminContent'));
const AdminVerification = lazy(() => import('./pages/admin/AdminVerification'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminBroadcast = lazy(() => import('./pages/admin/AdminBroadcast'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminVisitors = lazy(() => import('./pages/admin/AdminVisitors'));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AccessTokenPage = lazy(() => import('./pages/settings/AccessTokenPage'));
const AdminTokens = lazy(() => import('./pages/admin/AdminTokens'));

const FollowListPage = lazy(() => import('./pages/profile/FollowListPage'));

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
  { name: "AI", path: "/ai", element: <AiChatPage /> },
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
