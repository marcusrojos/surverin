import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>);
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role === 'admin') return <Navigate to="/admin" replace />;
  if (role === 'livreur') return <Navigate to="/driver" replace />;
  if (role === 'pharmacie') return <Navigate to="/pharmacy" replace />;

  return (<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>);
};

export default Index;
