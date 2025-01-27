import React, { useEffect, useState } from 'react';

import { SuiGraphQLClient } from '@mysten/sui/graphql';
import {
  generateRandomness,
  ZkLoginPublicIdentifier,
} from '@mysten/sui/zklogin';
import { Cross2Icon } from '@radix-ui/react-icons';
import Peer from 'peerjs';
import { QRCode } from 'react-qrcode-logo';

import {
  DlgClose,
  DlgContent,
  DlgDescription2,
  DlgOverlay,
  DlgPortal,
  DlgRoot,
  DlgTitle,
} from './modal';
import {
  makeMessage,
  MessageType,
  NETWORK,
  NotiVariant,
  parseMessage,
} from '../utils/types';

export const QRLoginCode = ({
  mode = 'light',
  network,
  icon,
  onEvent,
  onClose,
}: {
  mode?: 'dark' | 'light';
  network: NETWORK;
  icon: string;
  onEvent: (data: { variant: NotiVariant; message: string }) => void;
  onClose: (result: string | { address: string; network: NETWORK }) => void;
}) => {
  const [open, setOpen] = useState<boolean>(true);
  const peerId = `sui::${network}::${parseInt(generateRandomness(), 10).toString(16).replace(/0+$/, '')}::login`;

  useEffect(() => {
    const peer = new Peer(peerId.replace(/::/g, '-'));

    peer.on('connection', (connection) => {
      connection.on('data', async (data) => {
        try {
          const message = parseMessage(data as string);
          switch (message.type) {
            case MessageType.STEP_0:
              {
                onEvent({
                  variant: 'info',
                  message: 'Connecting...',
                });
                setOpen(false);

                try {
                  const client = new SuiGraphQLClient({
                    url: `https://sui-${network}.mystenlabs.com/graphql`,
                  });
                  const {
                    address,
                    publicKey,
                    signature,
                  }: { address: string; publicKey: string; signature: string } =
                    JSON.parse(message.value);
                  const zkLoginPublicIdentifier = new ZkLoginPublicIdentifier(
                    publicKey,
                    { client },
                  );
                  const encoder = new TextEncoder();
                  const result =
                    await zkLoginPublicIdentifier.verifyPersonalMessage(
                      encoder.encode(peerId),
                      signature,
                    );

                  if (result) {
                    connection.send(makeMessage(MessageType.STEP_1, 'OK'));
                    onClose({ address, network });
                  } else {
                    connection.send(makeMessage(MessageType.STEP_1, 'FAIL'));
                    onClose('verifyPersonalMessage failed');
                  }
                } catch (error) {
                  connection.send(
                    makeMessage(
                      MessageType.STEP_1,
                      JSON.stringify(`error: ${error}`),
                    ),
                  );
                }
              }
              break;

            default:
              onEvent({
                variant: 'error',
                message: `Unknown message type: ${message.type}`,
              });
              connection.open && connection.close({ flush: true });
              open && setOpen(false);
              onClose(`Unknown message type: ${message.type}`);
          }
        } catch (error) {
          connection.open && connection.close({ flush: true });
          open && setOpen(false);
          onClose(`Unknown error: ${error}`);
        }
      });

      connection.on('error', (err) => {
        connection.open && connection.close({ flush: true });
        open && setOpen(false);
        onClose(`Connection error: ${err.message}`);
      });
    });

    peer.on('error', (err) => {
      open && setOpen(false);
      onClose(`Peer error: ${err.message}`);
    });

    return () => {
      peer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DlgRoot open={open}>
      <DlgPortal>
        <DlgOverlay mode={mode} />
        <DlgContent
          mode={mode}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <DlgTitle mode={mode}>Login</DlgTitle>
            <DlgClose
              mode={mode}
              onClick={() => {
                setOpen(false);
                onClose('User closed');
              }}
            >
              <Cross2Icon />
            </DlgClose>
          </div>
          <QRCode
            value={peerId}
            logoImage={icon}
            logoPadding={10}
            size={256}
            qrStyle="dots"
            style={{ width: '100%' }}
          />
          <DlgDescription2 mode={mode}>
            Please scan the QR code to log in.
          </DlgDescription2>
        </DlgContent>
      </DlgPortal>
    </DlgRoot>
  );
};
