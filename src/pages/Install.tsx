import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Download, Smartphone, Monitor, CheckCircle } from 'lucide-react';
import dpciLogo from '@/assets/dpci-logo.webp';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg animate-fade-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center p-3">
            <img src={dpciLogo} alt="DPCI" className="w-full h-full object-contain" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Installer DPCI</CardTitle>
            <CardDescription>Accédez rapidement à l'application depuis votre écran d'accueil</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isInstalled ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle className="w-16 h-16 text-primary mx-auto" />
              <p className="text-lg font-medium">Application installée !</p>
              <p className="text-muted-foreground text-sm">Vous pouvez maintenant accéder à DPCI depuis votre écran d'accueil.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/50">
                  <Smartphone className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Mobile (Android/iOS)</p>
                    <p className="text-muted-foreground text-xs">Fonctionnement hors-ligne, notifications push, accès rapide</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/50">
                  <Monitor className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Bureau (Windows/Mac/Linux)</p>
                    <p className="text-muted-foreground text-xs">Application native avec raccourci bureau</p>
                  </div>
                </div>
              </div>

              {deferredPrompt ? (
                <Button onClick={handleInstall} className="w-full" size="lg">
                  <Download className="w-5 h-5 mr-2" />
                  Installer l'application
                </Button>
              ) : (
                <div className="text-center space-y-3">
                  <p className="text-muted-foreground text-sm">
                    Sur <strong>Android</strong> : Menu du navigateur → "Ajouter à l'écran d'accueil"
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Sur <strong>iOS</strong> : Safari → Partager → "Sur l'écran d'accueil"
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Sur <strong>PC</strong> : Chrome → Barre d'adresse → Icône d'installation
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
