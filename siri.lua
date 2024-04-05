server = TcpSocketServer.New()
sockets = {} 
json = require("rapidjson")
local GCIR = Component.New("GCIR")
local TV = Component.New("VideoOutput_2")
function SendResponse(NewSocketInstance,ResponseBody)
  local FullResponse = [[<HTML>
    <HEAD>
        <TITLE>Response has been received by Q-Sys</TITLE>
        <style type="text/css">filelist { visibility: hidden; }</style>
    </HEAD>
    <BODY>
        <B>]]..ResponseBody..[[</B>
    </BODY>
</HTML>]]
  NewSocketInstance:Write(FullResponse)
end

--Parse response looking for Key / Value pair-----------------------------------------------------
function ParseRequest(NewSocketInstance,req)
  print(req:match("TV"))
  if req:match("TV") then 
    if req:match("On") then 
      GCIR["IR1Trigger 1"]:Trigger()
      TV["cec.button.on"]:Trigger()
    end
    if req:match("Off") then 
      GCIR["IR1Trigger 2"]:Trigger()
      TV["cec.button.off"]:Trigger()
    end
  end
end

--Remove socket from table------------------------------------------------------------------------
function RemoveSocketFromTable(sock)
  for k,v in pairs(sockets) do
    if v == sock then 
      table.remove(sockets, k) 
      return
    end
  end
end
 
--Function called from server.EventHandler when a URL call is received----------------------------
function SocketHandler(sock, event) -- the arguments for this EventHandler are documented in the EventHandler definition of TcpSocket Properties
  --print( "TCP Socket Event: "..event )
  if event == TcpSocket.Events.Data then
    local Response = sock:Read(sock.BufferLength)
    print(Response)
    ParseRequest(sock, Response)
  elseif event == TcpSocket.Events.Closed or
         event == TcpSocket.Events.Error or
         event == TcpSocket.Events.Timeout then
    -- remove reference of socket from table so
    -- it's available for garbage collection
    RemoveSocketFromTable(sock)
  end
end
