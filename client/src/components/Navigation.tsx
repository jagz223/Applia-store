import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useCurrentProvider } from "@/hooks/use-mango-data";
import { 
  Briefcase, 
  Calendar, 
  Home, 
  LayoutDashboard, 
  LogOut, 
  Menu, 
  Search, 
  User 
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

export function Navigation() {
  const { user, logout, isAuthenticated } = useAuth();
  const { data: providerProfile } = useCurrentProvider();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) => location === path;

  const NavLinks = () => (
    <>
      <Link href="/" className={`text-sm font-medium transition-colors hover:text-primary ${isActive('/') ? 'text-primary' : 'text-muted-foreground'}`}>
        Home
      </Link>
      <Link href="/explore" className={`text-sm font-medium transition-colors hover:text-primary ${isActive('/explore') ? 'text-primary' : 'text-muted-foreground'}`}>
        Explore
      </Link>
      <Link href="/categories" className={`text-sm font-medium transition-colors hover:text-primary ${isActive('/categories') ? 'text-primary' : 'text-muted-foreground'}`}>
        Categories
      </Link>
    </>
  );

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 mx-auto">
        
        {/* Logo & Desktop Nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            {/* Using static logo import as requested */}
            <img src="/logo.png" alt="MANGO Logo" className="h-8 w-auto object-contain" />
            <span className="hidden text-xl font-bold font-display text-primary sm:inline-block">MANGO</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <NavLinks />
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-4">
          
          {isAuthenticated ? (
            <>
              {providerProfile ? (
                 <Button variant="ghost" className="hidden sm:flex items-center gap-2 text-primary" asChild>
                   <Link href="/dashboard">
                     <LayoutDashboard className="h-4 w-4" />
                     <span>Dashboard</span>
                   </Link>
                 </Button>
              ) : (
                <Button variant="outline" className="hidden sm:flex border-primary text-primary hover:bg-primary/10" asChild>
                  <Link href="/become-pro">Become a Pro</Link>
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full ring-2 ring-primary/20 hover:ring-primary/40 p-0 overflow-hidden">
                    {user?.profileImageUrl ? (
                      <img src={user.profileImageUrl} alt={user.firstName || "User"} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-primary/10 text-primary font-bold text-lg">
                        {(user?.firstName?.[0] || "U").toUpperCase()}
                      </div>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.firstName} {user?.lastName}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="cursor-pointer">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      <span>Dashboard</span>
                    </Link>
                  </DropdownMenuItem>
                  {providerProfile && (
                    <DropdownMenuItem asChild>
                      <Link href={`/provider/${providerProfile.id}`} className="cursor-pointer">
                        <Briefcase className="mr-2 h-4 w-4" />
                        <span>My Public Profile</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="cursor-pointer text-red-500 focus:text-red-500" onClick={() => logout()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <a href="/api/login">
                <Button className="font-semibold shadow-lg shadow-primary/20 rounded-full px-6">
                  Sign In
                </Button>
              </a>
            </>
          )}

          {/* Mobile Menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <div className="flex flex-col gap-6 py-6">
                <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
                  <img src="/logo.png" alt="MANGO" className="h-8 w-auto" />
                  <span className="text-xl font-bold font-display text-primary">MANGO</span>
                </Link>
                <div className="flex flex-col gap-4">
                  <Link href="/" onClick={() => setMobileOpen(false)} className="text-lg font-medium hover:text-primary">
                    Home
                  </Link>
                  <Link href="/explore" onClick={() => setMobileOpen(false)} className="text-lg font-medium hover:text-primary">
                    Explore Services
                  </Link>
                  <Link href="/categories" onClick={() => setMobileOpen(false)} className="text-lg font-medium hover:text-primary">
                    Categories
                  </Link>
                  {isAuthenticated && (
                    <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="text-lg font-medium hover:text-primary">
                      My Dashboard
                    </Link>
                  )}
                  {!providerProfile && (
                    <Link href="/become-pro" onClick={() => setMobileOpen(false)} className="text-lg font-medium text-primary">
                      Become a Pro
                    </Link>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
