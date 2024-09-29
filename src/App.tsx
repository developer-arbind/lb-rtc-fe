import { useEffect, useState, useRef , useCallback} from 'react'
import io from 'socket.io-client';
import './App.css'
class Peer {
  public peer: any;
  constructor() {
    if (!this.peer) {
      this.makePeer();
    }
  }
  async makePeer() {
    this.peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: [
            "stun:stun.l.google.com:19302",
            "stun:global.stun.twilio.com:3478",
          ],
        },
      ],
    });
  }
  async getOffer() {
    if (this.peer) {
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(new RTCSessionDescription(offer));
      return offer;
    }
  }
  async connectRemoteOffer(offer: any) {
    if (this.peer) {
      await this.peer.setRemoteDescription(offer);
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(new RTCSessionDescription(answer));
      return answer;
    }
  }
  async setRemoteDescription(ans: any) {
    if (this.peer) {
      await this.peer.setRemoteDescription(new RTCSessionDescription(ans));
    }
  }
}
const socketInstance = io('http://localhost:8000');
socketInstance.connect();
function App() {
const [socketId, setSocketId] =  useState<string>("");
const connecting = useRef<boolean>(false);
const idx = useRef<number>(0); 
const idsRef = useRef<any>([]);
const Pcs = useRef<Array<{
  id: string,
  pc: Peer
}>>([]);
const [streams, setStreams] = useState<Array<{
  vid: MediaStream,
  socketId: string,
  ref:any
}>>([]);
const videoRef = useRef<HTMLVideoElement>(null);
const nextPersonSenderId = useRef<string>("");
const nextPersonId = useRef<string>("");

const mainStream = useRef<MediaStream>();
 useEffect(() => {
    if (streams.length > 0) {
      const lastStream: any = streams[streams.length - 1];
      if (lastStream.ref && lastStream.ref.current) {
        lastStream.ref.current.srcObject = lastStream.vid;
        lastStream.ref.current.play();
      }
    }
    
  }, [streams]);
const createStream = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio:  true, video: true});
  mainStream.current = stream;
    const refObject = {...videoRef}
   setStreams(prev => [...prev, {
    vid: stream,
    socketId,
    ref: refObject
   }]);
  socketInstance.emit("GET-ALL-SOCKET-USERS");
}

const createLocalOffer = async (id: string) => {
  const offer = await Pcs.current[Pcs.current.length - 1].pc.getOffer();
  socketInstance.emit("send-offer", {
    offer, socketId: id
  });
};
const setTracks = useCallback(() => {
  console.log("sending-tracks: ");
    const senders =
      Pcs.current[Pcs.current.length - 1].pc.peer.getSenders();
    for (let track of mainStream.current!.getTracks()) {
      let sender;
      try {
        sender = senders.find((s: any) => s.track.kind === track.kind);
      } catch (err) {}
      if (sender) {
        console.log("replacing tracks; ",Pcs.current[Pcs.current.length - 1]); 
        sender.replaceTrack(track);
      } else {
        console.log("++" + Math.random()*1)
        console.log("adding tracks: ", Pcs.current[Pcs.current.length - 1]);
        Pcs.current[Pcs.current.length - 1].pc.peer.addTrack(
          track,
          mainStream.current
        );
      }
    }
}, [mainStream.current]);
  const removeTracks = useCallback((socketId: any) => {
  const peerIndex = Pcs.current.findIndex((pcObj: any) => pcObj.id === socketId);
  if (peerIndex !== -1) {
    const senders = Pcs.current[peerIndex].pc.peer.getSenders();
    senders.forEach((sender: any) => {
      Pcs.current[peerIndex].pc.peer.removeTrack(sender);
    });
    Pcs.current = Pcs.current.filter((pcObj: any) => pcObj.id !== socketId);
  }
}, []);
const makePeerConnections = async  (ids: [string]) => {
   Pcs.current.push({id: ids[idx.current], pc: new Peer()});
  nextPersonId.current = ids[idx.current];
    await createLocalOffer(ids[idx.current]);
}
  useEffect(() => {
    socketInstance.on("on-connected", (id: string) => {
      setSocketId(id);
      createStream();
    });
    
    socketInstance.on("on-ids-get", (ids: [string]) => {
      idsRef.current = ids;
      console.log("IDS: ", ids);
      if(ids.length > 1 ) {
        console.log ("nepali songs")
        connecting.current = true;
        makePeerConnections(ids);
      } 
    });

    socketInstance.on("get-remote-offer", async ({offer, socketId}: {
      offer: any, socketId: string
    }) => {
      Pcs.current.push({id: socketId, pc: new Peer()});
      const anwser = await Pcs.current[Pcs.current.length - 1].pc.connectRemoteOffer(offer);
      console.log("recived remote offer: ", offer)
      socketInstance.emit("send-anwser", {anwser, socketId});
      Pcs.current[Pcs.current.length - 1].pc.peer.addEventListener("track", getTracks);
       Pcs.current[Pcs.current.length - 1].pc.peer.addEventListener("negotiationneeded", makeNegotiation);
    });
    socketInstance.on("get-remote-anwser", async ({anwser, socketId}: {
      anwser:  any, socketId: string }) => {
        console.log("recived anwser:  ", socketId, anwser);
       await  Pcs.current[Pcs.current.length - 1].pc.setRemoteDescription(anwser);
      Pcs.current[Pcs.current.length - 1].pc.peer.addEventListener("track", getTracks);
        Pcs.current[Pcs.current.length - 1].pc.peer.addEventListener("negotiationneeded", makeNegotiation);
      setTracks();
    });
    socketInstance.on("get-remote-nego-ans", async ({anwser, socketId}: {
      anwser:  any, socketId: string }) => {
        console.log("recived nego anwser:  ", socketId, anwser);
       await  Pcs.current[Pcs.current.length - 1].pc.setRemoteDescription(anwser);
      socketInstance.emit("send-track-vice-versa", socketId);
      setTracks();
    });

    socketInstance.on("send-track", (socketId: string) => {
      console.log("I may need to send tracks??🙄");
      nextPersonSenderId.current = socketId;
      setTracks();
    })
  socketInstance.on("set-negotiation-offer", async ({offer, socketId}) => {
    console.log("recived negotiation offer: ", offer, socketId);
     const anwser = await Pcs.current[Pcs.current.length - 1].pc.connectRemoteOffer(offer);
      socketInstance.emit("send-anwser-nego", {anwser, socketId});
  });
    socketInstance.on("on-someone-disconnects", (socketId) => {
      removeTracks(socketId);
       setStreams((prev) =>
          prev.filter((stream) => stream.socketId !== socketId)
        );
    })
  }, []);
  
  useEffect(() => {
      window.addEventListener("beforeunload", function (e) {
        e.returnValue = "";
        socketInstance.emit("i-am-leaving");
      });
  }, [])
  
  const getTracks = useCallback((event: any) => { 
    console.log("getting-tracks: ");
     const media = event.streams[0] as MediaStream;
     const track = event.track;
    if(track.kind === "audio") return;
     const refObject = {...videoRef}
    setStreams(prev => [...prev,  {
      vid: media,
      socketId: nextPersonId.current,
      ref: refObject
    }]);
    if (idx.current + 1 !== idsRef.current.length && connecting.current) {
      idx.current++;
      makePeerConnections(idsRef.current); 
    }else {
      connecting.current = false;
    }
  }, []);
  const makeNegotiation = useCallback(async () => {
    console.log("negotiation needed: ", !nextPersonSenderId.current ? nextPersonId.current : nextPersonSenderId.current);
    const offer = await Pcs.current[Pcs.current.length - 1].pc.getOffer();
    socketInstance.emit("send-negotiation-offer", {
      socketId: !nextPersonSenderId.current ? nextPersonId.current : nextPersonSenderId.current,
      offer,
    });
  }, []);


  return (
    <>
     <div>
        {streams.length > 0 && (
          <div>
            hello
            {streams.map((rtcs, index) => {
              return <div key={index}>
                <video ref={rtcs.ref} autoPlay width={"300x"} height={"200px"}></video>
              </div>
            })}
          </div>
        )}
     </div>
    </>
  )
}

export default App
