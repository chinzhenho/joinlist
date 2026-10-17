package dev.joinlist;

import org.springframework.boot.SpringApplication;

public class TestJoinlistApplication {

	public static void main(String[] args) {
		SpringApplication.from(JoinlistApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
