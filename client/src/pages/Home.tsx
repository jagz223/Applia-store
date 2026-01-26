import { Link } from "wouter";
import { useCategories } from "@/hooks/use-mango-data";
import { Button } from "@/components/ui/button";
import { ArrowRight, Search, Zap, Shield, Heart } from "lucide-react";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";

export default function Home() {
  const { data: categories, isLoading } = useCategories();

  // Helper to dynamically render Lucide icon
  const CategoryIcon = ({ name }: { name: string }) => {
    const IconComponent = (Icons as any)[name] || Icons.HelpCircle;
    return <IconComponent className="h-6 w-6" />;
  };

  return (
    <div className="flex flex-col min-h-screen">
      
      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-24 md:pb-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"></div>
        <div className="absolute top-0 right-0 -z-10 h-[500px] w-[500px] bg-accent/20 blur-[100px] rounded-full translate-x-1/3 -translate-y-1/3"></div>
        
        <div className="container px-4 sm:px-6 lg:px-8 mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            {/* Hero Text */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-semibold text-primary">
                <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                The #1 Service Marketplace
              </div>
              
              <h1 className="text-4xl md:text-6xl font-display font-bold text-foreground leading-tight">
                Find the perfect <span className="text-primary">Pro</span> for your next project.
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-lg">
                Connect with skilled professionals and technicians in your area. From home repairs to digital services, Mango has you covered.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link href="/explore">
                  <Button size="lg" className="h-14 px-8 rounded-full text-lg shadow-xl shadow-primary/20 hover:scale-105 transition-transform">
                    Explore Services <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/become-pro">
                  <Button size="lg" variant="outline" className="h-14 px-8 rounded-full text-lg border-2 hover:bg-secondary/5 hover:text-secondary hover:border-secondary transition-all">
                    Become a Pro
                  </Button>
                </Link>
              </div>
            </motion.div>

            {/* Hero Image / Illustration */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative hidden lg:block"
            >
              <div className="relative z-10 grid grid-cols-2 gap-4">
                 {/* Man fixing sink - Unsplash */}
                <div className="space-y-4 translate-y-8">
                  <div className="rounded-2xl overflow-hidden shadow-2xl rotate-[-3deg] hover:rotate-0 transition-transform duration-500">
                    <img 
                      src="https://images.unsplash.com/photo-1581578731117-104f2a417954?w=400&h=500&fit=crop" 
                      alt="Professional Plumber" 
                      className="w-full h-auto object-cover"
                    />
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-lg border border-border/50 max-w-[200px] ml-auto">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-green-100 text-green-600 rounded-full"><Shield className="h-4 w-4" /></div>
                      <span className="font-bold text-sm">Verified Pros</span>
                    </div>
                    <p className="text-xs text-muted-foreground">All providers are vetted for quality.</p>
                  </div>
                </div>

                {/* Electrician working - Unsplash */}
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-xl shadow-lg border border-border/50 max-w-[200px]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-yellow-100 text-yellow-600 rounded-full"><Heart className="h-4 w-4" /></div>
                      <span className="font-bold text-sm">Top Rated</span>
                    </div>
                    <p className="text-xs text-muted-foreground">4.8/5 average rating from users.</p>
                  </div>
                  <div className="rounded-2xl overflow-hidden shadow-2xl rotate-[3deg] hover:rotate-0 transition-transform duration-500">
                    <img 
                      src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&h=500&fit=crop" 
                      alt="Electrician" 
                      className="w-full h-auto object-cover"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CATEGORIES SECTION */}
      <section className="py-20 bg-muted/30">
        <div className="container px-4 sm:px-6 lg:px-8 mx-auto max-w-7xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-display font-bold mb-4">Popular Categories</h2>
            <p className="text-muted-foreground">Explore our most requested services and find the right expert for the job.</p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 animate-pulse rounded-xl"></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {categories?.slice(0, 6).map((cat) => (
                <Link key={cat.id} href={`/explore?category=${cat.id}`}>
                  <div className="group flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-border/50 shadow-sm hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer h-full">
                    <div className="mb-4 p-3 rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                      <CategoryIcon name={cat.icon} />
                    </div>
                    <span className="font-semibold text-center group-hover:text-primary transition-colors">{cat.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20">
        <div className="container px-4 sm:px-6 lg:px-8 mx-auto max-w-7xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-display font-bold mb-4">How Mango Works</h2>
            <p className="text-muted-foreground">Get your job done in three simple steps.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Connecting line (desktop) */}
            <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-primary/10 via-primary/40 to-primary/10 -z-10"></div>

            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-white border-4 border-primary/10 flex items-center justify-center mb-6 shadow-xl text-primary relative">
                <Search className="h-10 w-10" />
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">1</div>
              </div>
              <h3 className="text-xl font-bold mb-3">Search</h3>
              <p className="text-muted-foreground px-4">Browse through hundreds of services and professional profiles to find your match.</p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-white border-4 border-secondary/10 flex items-center justify-center mb-6 shadow-xl text-secondary relative">
                <Zap className="h-10 w-10" />
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-secondary text-white rounded-full flex items-center justify-center font-bold">2</div>
              </div>
              <h3 className="text-xl font-bold mb-3">Book</h3>
              <p className="text-muted-foreground px-4">Select a service, choose a convenient time, and book securely through the platform.</p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-white border-4 border-accent/20 flex items-center justify-center mb-6 shadow-xl text-accent-foreground relative">
                <Heart className="h-10 w-10" />
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold">3</div>
              </div>
              <h3 className="text-xl font-bold mb-3">Relax</h3>
              <p className="text-muted-foreground px-4">Sit back while our verified professional gets the job done to your satisfaction.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-20 bg-primary/5">
        <div className="container px-4 sm:px-6 lg:px-8 mx-auto max-w-7xl">
          <div className="bg-primary rounded-3xl p-8 md:p-16 text-center text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <div className="relative z-10 max-w-3xl mx-auto space-y-8">
              <h2 className="text-3xl md:text-5xl font-display font-bold">Ready to get started?</h2>
              <p className="text-lg md:text-xl text-white/90">Join thousands of users and professionals on Mango today. Whether you need a service or offer one, we have a place for you.</p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link href="/explore">
                  <Button size="lg" variant="secondary" className="h-14 px-8 text-lg bg-white text-primary hover:bg-white/90 font-bold">
                    Find a Service
                  </Button>
                </Link>
                <Link href="/become-pro">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-2 border-white text-white hover:bg-white/10">
                    Join as a Pro
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
