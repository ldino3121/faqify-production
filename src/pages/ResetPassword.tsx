import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const ResetPassword = () => {
  const { toast } = useToast();
  const { requestPasswordReset, completePasswordReset } = useAuth();

  // UI state
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  // Detect if user arrived via recovery link (type=recovery or a temporary session exists)
  useEffect(() => {
    const checkRecovery = async () => {
      try {
        const url = new URL(window.location.href);
        const type = url.searchParams.get("type");
        if (type === "recovery") {
          setIsRecovery(true);
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.access_token) {
          // Supabase sets a temporary recovery session
          setIsRecovery(true);
        }
      } catch {}
    };
    checkRecovery();
  }, []);

  const canSubmitNewPassword = useMemo(() => {
    return newPassword.length >= 8 && newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      toast({
        title: "Reset Email Sent",
        description: "Check your inbox for a link to set a new password.",
      });
    } catch (err) {
      toast({
        title: "Request Failed",
        description: err instanceof Error ? err.message : "Unable to send reset email.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitNewPassword) return;
    setLoading(true);
    try {
      await completePasswordReset(newPassword);
      toast({
        title: "Password Updated",
        description: "Your password has been changed. Redirecting to login...",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    } catch (err) {
      toast({
        title: "Reset Failed",
        description: err instanceof Error ? err.message : "Unable to reset password.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">{isRecovery ? "Set New Password" : "Reset Password"}</CardTitle>
            <CardDescription className="text-gray-400">
              {isRecovery
                ? "Enter a new password for your account"
                : "Enter your email to receive a password reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isRecovery ? (
              <form onSubmit={handleRequestReset} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-gray-300">Email</label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-400"
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleCompleteReset} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-gray-300">New Password</label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter a new password (min 8 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-400"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="confirm" className="text-sm font-medium text-gray-300">Confirm Password</label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-400"
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={loading || !canSubmitNewPassword}>
                  {loading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;

