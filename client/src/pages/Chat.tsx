import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MessageSquare, 
  Send, 
  Phone, 
  Video, 
  MoreVertical, 
  Search,
  Paperclip,
  Image,
  Smile,
  Check,
  CheckCheck,
  Clock,
  User,
  ArrowLeft,
  PhoneCall,
  FileText,
  Calendar,
  MapPin
} from "lucide-react";
import { motion } from "framer-motion";

// Mock chat data
const conversations = [
  {
    id: 1,
    user: { name: "Carlos Mendoza", avatar: null, online: true },
    lastMessage: "Perfecto, nos vemos mañana a las 10am",
    time: "10:30 AM",
    unread: 2,
    service: "Consulta Legal"
  },
  {
    id: 2,
    user: { name: "María García", avatar: null, online: true },
    lastMessage: "Gracias por la información",
    time: "9:15 AM",
    unread: 0,
    service: "Asesoría Financiera"
  },
  {
    id: 3,
    user: { name: "Roberto Sánchez", avatar: null, online: false },
    lastMessage: "El servicio ha sido completado",
    time: "Ayer",
    unread: 0,
    service: "Mantenimiento"
  },
  {
    id: 4,
    user: { name: "Ana López", avatar: null, online: false },
    lastMessage: "Tengo una consulta sobre el presupuesto",
    time: "Ayer",
    unread: 1,
    service: "Consulta Técnica"
  },
  {
    id: 5,
    user: { name: "Pedro Torres", avatar: null, online: true },
    lastMessage: "¿Cuándo puedo agendar la próxima sesión?",
    time: "18 Feb",
    unread: 0,
    service: "Auditoría"
  },
];

const messages = [
  { id: 1, sender: "user", text: "Hola, tengo una consulta sobre el servicio de asesoría legal", time: "10:00 AM", status: "read" },
  { id: 2, sender: "me", text: "¡Hola! Buenos días, claro que sí. ¿En qué puedo ayudarle?", time: "10:02 AM", status: "read" },
  { id: 3, sender: "user", text: "Necesito información sobre los requisitos para constituir una empresa en Ecuador", time: "10:05 AM", status: "read" },
  { id: 4, sender: "me", text: "Perfecto, con gusto le asesoro. ¿Ya tiene definido el tipo de compañía que desea constituir? Las más comunes son: Compañía Limitada (Cía. Ltda.) o Sociedad Anónima (S.A.)", time: "10:08 AM", status: "read" },
  { id: 5, sender: "user", text: "Aún no, me gustaría saber las diferencias y cuál me recomienda", time: "10:12 AM", status: "read" },
  { id: 6, sender: "me", text: "Para un negocio pequeño le recomiendo la Compañía Limitada. Requiere mínimo 2 socios y el capital mínimo es de $400. La Sociedad Anónima es mejor si busca inversión externa, requiere mínimo 3 socios y $800 de capital.", time: "10:15 AM", status: "read" },
  { id: 7, sender: "user", text: "Entiendo, ¿cuánto tiempo toma el proceso?", time: "10:20 AM", status: "read" },
  { id: 8, sender: "me", text: "El proceso completo suele tomar entre 5-7 días hábiles si toda la documentación está en orden. Yo puedo gestionar todo el proceso por usted.", time: "10:22 AM", status: "read" },
  { id: 9, sender: "user", text: "Perfecto, nos vemos mañana a las 10am", time: "10:30 AM", status: "delivered" },
];

export default function Chat() {
  const [selectedConversation, setSelectedConversation] = useState<number | null>(1);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const filteredConversations = conversations.filter(c => 
    c.user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = () => {
    if (messageInput.trim()) {
      // In a real app, this would send the message
      setMessageInput("");
    }
  };

  const selectedChat = conversations.find(c => c.id === selectedConversation);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="bg-gradient-to-r from-primary/20 via-background to-accent/20 border-b border-border">
        <div className="container px-4 py-6 mx-auto max-w-7xl">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold">
                  Mensajes <span className="text-gradient-primary">en Vivo</span>
                </h1>
                <p className="text-muted-foreground text-sm">
                  Chatea directamente con clientes y profesionales
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Chat Interface */}
      <section className="py-6 pb-16">
        <div className="container px-4 mx-auto max-w-7xl">
          <Card className="card-industrial overflow-hidden">
            <div className="grid md:grid-cols-[320px_1fr] h-[calc(100vh-280px)] min-h-[500px]">
              
              {/* Conversations List */}
              <div className="border-r border-border flex flex-col">
                {/* Search */}
                <div className="p-4 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Buscar conversaciones..." 
                      className="input-industrial pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* Conversations */}
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1">
                    {filteredConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        onClick={() => setSelectedConversation(conversation.id)}
                        className={`
                          w-full p-3 rounded-lg text-left transition-all flex items-start gap-3
                          ${selectedConversation === conversation.id 
                            ? 'bg-primary/10 border border-primary/30' 
                            : 'hover:bg-primary/5 border border-transparent'}
                        `}
                      >
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                          {conversation.user.online && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-accent border-2 border-card"></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium truncate">{conversation.user.name}</p>
                            <span className="text-xs text-muted-foreground">{conversation.time}</span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{conversation.lastMessage}</p>
                          <p className="text-xs text-primary mt-1">{conversation.service}</p>
                        </div>
                        {conversation.unread > 0 && (
                          <Badge className="bg-primary text-primary-foreground">{conversation.unread}</Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Chat Window */}
              {selectedChat ? (
                <div className="flex flex-col">
                  {/* Chat Header */}
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="md:hidden"
                        onClick={() => setSelectedConversation(null)}
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </Button>
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        {selectedChat.user.online && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-accent border-2 border-card"></div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{selectedChat.user.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedChat.user.online ? "En línea" : "Desconectado"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" className="hidden sm:flex">
                        <Phone className="w-5 h-5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="hidden sm:flex">
                        <Video className="w-5 h-5" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="px-4 py-2 border-b border-border flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="text-xs h-7 border-border">
                      <Calendar className="w-3 h-3 mr-1" />
                      Agendar
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7 border-border">
                      <FileText className="w-3 h-3 mr-1" />
                      Compartir contrato
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7 border-border">
                      <MapPin className="w-3 h-3 mr-1" />
                      Ubicación
                    </Button>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {/* Date separator */}
                      <div className="flex items-center justify-center">
                        <span className="text-xs text-muted-foreground bg-card px-3 py-1 rounded-full">
                          Hoy, 22 de Febrero 2026
                        </span>
                      </div>

                      {messages.map((message) => (
                        <div 
                          key={message.id}
                          className={`flex ${message.sender === 'me' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`
                            max-w-[70%] p-3 rounded-2xl
                            ${message.sender === 'me' 
                              ? 'bg-primary text-primary-foreground rounded-br-md' 
                              : 'bg-muted rounded-bl-md'}
                          `}>
                            <p className="text-sm">{message.text}</p>
                            <div className={`flex items-center justify-end gap-1 mt-1 ${message.sender === 'me' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                              <span className="text-xs">{message.time}</span>
                              {message.sender === 'me' && (
                                message.status === 'read' ? (
                                  <CheckCheck className="w-3 h-3" />
                                ) : message.status === 'delivered' ? (
                                  <CheckCheck className="w-3 h-3 opacity-70" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Message Input */}
                  <div className="p-4 border-t border-border">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" className="shrink-0">
                        <Paperclip className="w-5 h-5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="shrink-0 hidden sm:flex">
                        <Image className="w-5 h-5" />
                      </Button>
                      <Input 
                        placeholder="Escribe un mensaje..." 
                        className="input-industrial flex-1"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      />
                      <Button variant="ghost" size="icon" className="shrink-0">
                        <Smile className="w-5 h-5" />
                      </Button>
                      <Button 
                        className="shrink-0 bg-primary hover:bg-primary/90"
                        onClick={handleSendMessage}
                        disabled={!messageInput.trim()}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                    <h3 className="text-lg font-medium mb-2">Selecciona una conversación</h3>
                    <p className="text-sm text-muted-foreground">
                      Elige una conversación del panel lateral para empezar a chatear
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
