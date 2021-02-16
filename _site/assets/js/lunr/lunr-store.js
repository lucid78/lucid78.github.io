var store = [{
        "title": "Pwntoolscpp 1",
        "excerpt":"pwntools는 CTF에 관심있는 사람이라면 한번쯤은 들어봤을 법한 pwnable을 위한 전용 도구이다. (https://github.com/Gallopsled/pwntools) python으로 제작된 이 도구는 ctf에서 pwnable을 빠르게 진행할 수 있도록 각종 편의 기능을 보유하고 있어 매우 편리하다. 만약 비교적 최근에 pwnable을 시작한 newbie라면 hexray(IDA)와 pwntools 없이는 pwnable이 불가능할 수도 있을만큼 필수적인 도구로 자리매김하고 있다. 취미 생활로 CTF 풀이를...","categories": [],
        "tags": [],
        "url": "https://lucid78.github.io/pwntoolscpp-1/",
        "teaser": null
      },{
        "title": "Pwntoolscpp 2",
        "excerpt":"recvuntil 라이브러리로 작성된 완전한 코드는 아래에서 확인 가능하다. https://github.com/lucid78/pwntoolscpp recvuntil() 함수는 이 함수에 전달된 파라미터 문자가 대상의 출력에서 발견될 때까지 읽어들이는 함수이다. C에서라면 read() 함수로 문자를 1바이트씩 읽으면서 delim 문자인지 확인을 하는 꽤 귀찮은 작업을 거쳐야 하지만, boost에서는 boost::asio::read_until이라는 함수가 이 기능을 지원한다. (https://www.boost.org/doc/libs/1_70_0/doc/html/boost_asio/reference/read_until.html) boost::asio::read_until()의 사용법은 아래와 같다. boost::asio::streambuf buf;...","categories": [],
        "tags": [],
        "url": "https://lucid78.github.io/pwntoolscpp-2/",
        "teaser": null
      },{
        "title": "Pwntoolscpp 3",
        "excerpt":"LAB4 라이브러리로 작성된 완전한 코드는 아래에서 확인 가능하다. https://github.com/lucid78/pwntoolscpp 이제 가장 기본적인 기능은 어느정도 완성되었고, lab3에서도 동작하는 것을 확인했으니 이번에는 lab4를 공략해보자. 아래는 https://bachs.tistory.com/entry/HITCON-Training-lab4-return-to-library 에서 발췌한 lab4를 공략하는 exploit이다. from pwn import * p = process('./ret2lib') e = ELF('./ret2lib') #found address of puts got log.info(\"found address of puts got :...","categories": [],
        "tags": [],
        "url": "https://lucid78.github.io/pwntoolscpp-3/",
        "teaser": null
      },{
        "title": "Pwntoolscpp 4",
        "excerpt":"마지막으로 ELF 클래스에 got() 함수를 추가하는 작업만이 남았다. PLT와 GOT에 대한 추가 설명은 아래 링크로 대신한다. PLT와 GOT 자세히 알기 1 앞서 binary에 설정된 stack canary check를 위해 해당 파일의 모든 symbol 정보를 가져오는 get_symbol() 함수를 작성했었다. ELF 클래스의 가장 마지막에 아래와 같이 수집한 symbol의 정보를 출력하는 print_symbols() 함수를 추가하고...","categories": [],
        "tags": [],
        "url": "https://lucid78.github.io/pwntoolscpp-4/",
        "teaser": null
      }]
